<?php

namespace Database\Seeders;

use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use LogicException;

class AccountsSeeder extends Seeder
{
    use WithoutModelEvents;

    public function run(): void
    {
        if (app()->environment('production')) {
            throw new LogicException('AccountsSeeder refuses to run in production.');
        }

        $accounts = new DemoAccounts;
        $users = $accounts->validatedUsers();
        DB::transaction(fn () => $accounts->seedUsers($users));
    }
}
