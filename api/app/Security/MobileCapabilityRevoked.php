<?php

namespace App\Security;

use RuntimeException;

final class MobileCapabilityRevoked extends RuntimeException
{
    public const CODE = 'CAPABILITY_REVOKED';

    public function __construct()
    {
        parent::__construct('The mobile capability is no longer current.');
    }
}
