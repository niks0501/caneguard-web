<?php

namespace App\Http\Resources;

use App\Models\Advisory;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Advisory */
class AdvisoryResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'uuid' => $this->uuid,
            'code' => $this->code,
            'title' => $this->title,
            'content' => $this->content,
            'status' => $this->status,
            'validation_provenance' => $this->validation_provenance,
            'validated_by' => $this->when($this->relationLoaded('validatedBy'), fn () => $this->validatedBy ? [
                'uuid' => $this->validatedBy->uuid,
                'name' => $this->validatedBy->name,
            ] : null),
            'validated_at' => $this->validated_at?->utc()->toISOString(),
            'retired_by' => $this->when($this->relationLoaded('retiredBy'), fn () => $this->retiredBy ? [
                'uuid' => $this->retiredBy->uuid,
                'name' => $this->retiredBy->name,
            ] : null),
            'retired_at' => $this->retired_at?->utc()->toISOString(),
            'created_at' => $this->created_at?->utc()->toISOString(),
            'updated_at' => $this->updated_at?->utc()->toISOString(),
        ];
    }
}
