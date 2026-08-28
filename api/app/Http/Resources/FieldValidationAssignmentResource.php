<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class FieldValidationAssignmentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'uuid' => $this->uuid,
            'assignee' => [
                'uuid' => $this->assignee->uuid,
                'name' => $this->assignee->name,
            ],
            'assigned_by' => [
                'uuid' => $this->assignedBy->uuid,
                'name' => $this->assignedBy->name,
            ],
            'target_visit_date' => $this->target_visit_date?->format('Y-m-d'),
            'activated_at' => $this->activated_at->utc()->toISOString(),
            'updated_at' => $this->updated_at->utc()->toISOString(),
        ];
    }
}
