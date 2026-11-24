<?php

namespace Tests\Unit;

use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class PrivateStoragePermissionsTest extends TestCase
{
    public function test_private_disk_creates_group_accessible_directories_and_files(): void
    {
        $root = sys_get_temp_dir().'/caneguard-private-'.bin2hex(random_bytes(4));
        $disk = Storage::build([...config('filesystems.disks.local'), 'root' => $root]);

        try {
            $disk->put('reports/2026/11/photo.jpg', 'x');

            // The deploy user must be able to enumerate what PHP-FPM creates.
            $this->assertSame(0770, fileperms("$root/reports") & 0777);
            $this->assertSame(0770, fileperms("$root/reports/2026/11") & 0777);
            $this->assertSame(0660, fileperms("$root/reports/2026/11/photo.jpg") & 0777);
        } finally {
            exec('rm -rf '.escapeshellarg($root));
        }
    }
}
