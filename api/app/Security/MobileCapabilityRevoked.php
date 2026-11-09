<?php

namespace App\Security;

use RuntimeException;

final class MobileCapabilityRevoked extends RuntimeException
{
    public const CODE = 'CAPABILITY_REVOKED';

    public function __construct(string $ability)
    {
        parent::__construct("The mobile capability {$ability} is no longer current.");
    }
}
