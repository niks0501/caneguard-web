<?php

namespace Tests\Unit;

use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class PrivateStoragePermissionsTest extends TestCase
{
    public function test_private_disk_creates_group_readable_directories_and_files_closed_to_others(): void
    {
        $root = sys_get_temp_dir().'/caneguard-private-'.bin2hex(random_bytes(4));
        $disk = Storage::build([...config('filesystems.disks.local'), 'root' => $root]);
        // PHP-FPM typically runs with umask 022, which strips the group write bit
        // from created directories. Pin it so the assertion is environment-independent.
        $previous = umask(022);

        try {
            $disk->put('reports/2026/11/photo.jpg', 'x');

            // The deploy user reaches these through the group/ACL class, so the
            // group needs read+traverse on directories and read on files, and
            // everyone else must stay locked out.
            foreach (['reports', 'reports/2026/11'] as $directory) {
                $mode = fileperms("$root/$directory") & 0777;
                $this->assertSame(0050, $mode & 0050, "$directory group cannot read and traverse");
                $this->assertSame(0, $mode & 0007, "$directory is open to others");
            }
            $file = fileperms("$root/reports/2026/11/photo.jpg") & 0777;
            $this->assertSame(0040, $file & 0040, 'file group cannot read');
            $this->assertSame(0, $file & 0007, 'file is open to others');
        } finally {
            umask($previous);
            exec('rm -rf '.escapeshellarg($root));
        }
    }
}
