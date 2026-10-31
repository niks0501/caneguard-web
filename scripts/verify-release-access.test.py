#!/usr/bin/env python3
"""Proposed Linux ACL regression tests; no sudo, FPM switch, or server access.

Uses native libacl metadata/fixtures so getfacl need not be installed locally.
worker-written tests are proposals, never proof of their own change; the implementer must never edit a proof test to make it pass; only the captain or the named delegate promotes a proposal to proof.
"""
import ctypes
import grp
import os
from pathlib import Path
import pwd
import shutil
import subprocess
import sys
import tempfile
import unittest

ACL_ACCESS = 0x8000
lib = ctypes.CDLL("libacl.so.1", use_errno=True)
lib.acl_from_text.argtypes = [ctypes.c_char_p]
lib.acl_from_text.restype = ctypes.c_void_p
lib.acl_set_file.argtypes = [ctypes.c_char_p, ctypes.c_int, ctypes.c_void_p]
lib.acl_get_file.argtypes = [ctypes.c_char_p, ctypes.c_int]
lib.acl_get_file.restype = ctypes.c_void_p
lib.acl_to_text.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
lib.acl_to_text.restype = ctypes.c_void_p
lib.acl_free.argtypes = [ctypes.c_void_p]


def set_acl(path, text):
    acl = lib.acl_from_text(text.encode())
    if not acl:
        raise OSError(ctypes.get_errno(), "acl_from_text")
    try:
        if lib.acl_set_file(os.fsencode(path), ACL_ACCESS, acl) != 0:
            raise OSError(ctypes.get_errno(), "acl_set_file")
    finally:
        lib.acl_free(acl)


def get_acl(path):
    acl = lib.acl_get_file(os.fsencode(path), ACL_ACCESS)
    if not acl:
        raise OSError(ctypes.get_errno(), "acl_get_file")
    text = lib.acl_to_text(acl, None)
    try:
        lines = []
        for line in ctypes.string_at(text).decode().splitlines():
            kind, qualifier, rest = line.split(":", 2)
            if qualifier and not qualifier.isdecimal():
                qualifier = str(pwd.getpwnam(qualifier).pw_uid if kind == "user"
                                else grp.getgrnam(qualifier).gr_gid)
            lines.append(f"{kind}:{qualifier}:{rest}")
        return "\n".join(lines) + "\n"
    finally:
        lib.acl_free(text)
        lib.acl_free(acl)


if len(sys.argv) > 1 and sys.argv[1] == "--getfacl":
    if os.environ.get("FAIL_ACL_TOOL"):
        sys.exit(1)
    print(get_acl(sys.argv[-1]), end="")
    sys.exit(0)


class ReleaseAccessTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="release-access-"))
        self.addCleanup(shutil.rmtree, self.tmp)
        self.release = self.tmp / "release"
        self.api = self.release / "api"
        self.shared = self.tmp / "shared"
        self.storage = self.shared / "storage"
        self.uid = pwd.getpwnam("www-data").pw_uid
        self.env = dict(os.environ)
        self.bin = self.tmp / "bin"
        self.bin.mkdir()
        (self.bin / "getfacl").write_text(
            '#!/bin/sh\nexec python3 "' + str(Path(__file__).resolve()) + '" --getfacl "$@"\n')
        (self.bin / "id").write_text(
            '#!/bin/sh\nif [ -n "${CHECK_UID:-}" ]; then\n'
            'case "$1" in -u) printf "%s\\n" "$CHECK_UID";; '
            '-G) printf "%s\\n" "$CHECK_GROUPS";; *) exit 1;; esac\n'
            'else exec /usr/bin/id "$@"; fi\n')
        for file in self.bin.iterdir():
            file.chmod(0o755)
        self.env["PATH"] = str(self.bin) + os.pathsep + self.env["PATH"]
        for directory in ["app", "bootstrap/cache", "config", "routes", "resources",
                          "vendor/nested", "public/assets"]:
            (self.api / directory).mkdir(parents=True, exist_ok=True)
        for directory in ["app", "framework/cache/data", "framework/sessions",
                          "framework/views", "logs"]:
            (self.storage / directory).mkdir(parents=True, exist_ok=True)
        self.secret = "TEST_SENTINEL_CONTENT_MUST_NOT_APPEAR"
        for file in ["vendor/autoload.php", "vendor/nested/class.php", "app/example.php",
                     "bootstrap/app.php", "bootstrap/cache/config.php", "public/index.php",
                     "public/index.html", "public/assets/app.js"]:
            (self.api / file).write_text(self.secret)
        (self.shared / ".env").write_text(self.secret)
        for file in ["framework/views/compiled.php", "logs/laravel.log", "framework/sessions/existing"]:
            (self.storage / file).write_text(self.secret)
        (self.api / ".env").symlink_to(self.shared / ".env")
        (self.api / "storage").symlink_to("../../shared/storage")
        for path in [self.tmp, *self.release.rglob("*"), self.release,
                     self.shared, *self.shared.rglob("*")]:
            if not path.is_symlink():
                runtime = path == self.storage or self.storage in path.parents
                self.grant(path, "rwx" if path.is_dir() and runtime else
                           "r-x" if path.is_dir() else "rw-" if runtime else "r--")

    def grant(self, path, rights, mask="rwx", other="---"):
        set_acl(path, f"u::rwx,u:{self.uid}:{rights},g::---,m::{mask},o::{other}")

    def check(self, success):
        result = subprocess.run(["php", str(Path(__file__).with_name("verify-release-access.php")),
                                 str(self.release)], env=self.env, capture_output=True, text=True)
        output = result.stdout + result.stderr
        self.assertNotIn(self.secret, output)
        self.assertEqual(result.returncode, 0 if success else 1, output)
        self.assertIn("PASS:" if success else "preflight failed:", output)
        return output

    def test_readable_release_and_writable_shared_state_pass_without_mutation(self):
        paths = [self.shared / ".env", self.api / "bootstrap/cache/config.php",
                 self.storage / "framework/views/compiled.php", self.storage / "logs/laravel.log"]
        def snapshot(path):
            contents = path.read_bytes()
            stat = path.stat()
            return (stat.st_mode, stat.st_uid, stat.st_gid, stat.st_mtime_ns,
                    stat.st_ctime_ns, get_acl(path), contents)
        before = [snapshot(path) for path in paths]
        self.check(True)
        self.assertEqual(before, [snapshot(path) for path in paths])

    def test_denied_release_ancestor_blocks_access(self):
        self.grant(self.tmp, "r--")
        self.check(False)

    def test_shared_ancestor_traversal_is_required(self):
        self.grant(self.shared, "r--")
        self.check(False)

    def test_masked_named_user_cannot_pass_on_the_textual_read_bit(self):
        self.grant(self.api / "vendor/autoload.php", "r--", mask="---")
        self.check(False)

    def test_every_required_tree_and_generated_file_is_checked(self):
        for path in [self.api / "app/example.php", self.api / "vendor/nested/class.php",
                     self.api / "bootstrap/cache/config.php", self.api / "public/index.html",
                     self.api / "public/assets/app.js", self.shared / ".env",
                     self.storage / "framework/views/compiled.php"]:
            with self.subTest(path=path.relative_to(self.tmp)):
                previous = get_acl(path)
                self.grant(path, "---")
                self.check(False)
                set_acl(path, previous)

    def test_runtime_requires_write_on_directories_and_existing_files(self):
        for path in [self.storage / "framework/cache/data", self.storage / "framework/sessions",
                     self.storage / "framework/views", self.storage / "logs/laravel.log"]:
            with self.subTest(path=path.relative_to(self.tmp)):
                previous = get_acl(path)
                self.grant(path, "r-x" if path.is_dir() else "r--")
                self.check(False)
                set_acl(path, previous)

    def test_missing_generated_config_is_rejected(self):
        (self.api / "bootstrap/cache/config.php").unlink()
        self.check(False)

    def test_missing_frontend_assets_are_rejected(self):
        shutil.rmtree(self.api / "public/assets")
        self.check(False)

    def test_unreadable_symlink_target_and_cycles_are_rejected(self):
        link = self.api / "app/link"
        link.symlink_to("../../private")
        (self.release / "private").write_text(self.secret)
        self.grant(self.release / "private", "---")
        self.check(False)
        link.unlink()
        link.symlink_to("link")
        self.check(False)

    def test_named_user_denial_does_not_fall_back_to_other(self):
        self.grant(self.api / "vendor/autoload.php", "---", other="r--")
        self.check(False)

    def test_owner_denial_does_not_fall_back_to_named_user(self):
        self.env.update(CHECK_UID=str(os.getuid()), CHECK_GROUPS=str(os.getgid()))
        set_acl(self.api / "vendor/autoload.php",
                f"u::---,u:{os.getuid()}:r--,g::r--,m::r--,o::r--")
        self.check(False)

    def test_matching_group_and_mask_permissions_are_supported(self):
        self.env.update(CHECK_UID=str(self.uid), CHECK_GROUPS=f"{os.getgid()} 12345")
        target = self.storage / "logs/laravel.log"
        set_acl(target, "u::rw-,g::---,g:12345:rw-,m::rw-,o::---")
        self.check(True)
        set_acl(target, "u::rw-,g::---,g:12345:rw-,m::r--,o::rw-")
        self.check(False)

    def test_partial_matching_groups_cannot_be_combined_for_read_write(self):
        self.env.update(CHECK_UID=str(self.uid), CHECK_GROUPS=f"{os.getgid()} 12345")
        set_acl(self.storage / "logs/laravel.log", "u::rw-,g::r--,g:12345:-w-,m::rw-,o::rw-")
        self.check(False)

    def test_metadata_command_failure_is_closed(self):
        self.env["FAIL_ACL_TOOL"] = "1"
        self.check(False)

    def test_unknown_or_root_identity_is_rejected(self):
        for uid in ["not-an-id", "0"]:
            with self.subTest(uid=uid):
                self.env.update(CHECK_UID=uid, CHECK_GROUPS="33")
                self.check(False)


if __name__ == "__main__":
    unittest.main()
