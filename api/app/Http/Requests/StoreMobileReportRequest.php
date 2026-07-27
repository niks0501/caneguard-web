<?php

namespace App\Http\Requests;

use App\Models\Report;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\File;

class StoreMobileReportRequest extends ApiFormRequest
{
    protected function prepareForValidation(): void
    {
        if (! $this->has('quality_warnings')) {
            $this->merge(['quality_warnings' => []]);
        }
    }

    public function authorize(): bool
    {
        return $this->user()?->can('create', Report::class) ?? false;
    }

    public function rules(): array
    {
        return [
            'client_uuid' => ['required', 'uuid'],
            'image' => [
                'required',
                File::image()
                    ->types(['jpg', 'jpeg', 'png', 'webp'])
                    ->max(10 * 1024),
            ],
            'image_source_type' => [
                'required',
                Rule::in(['camera', 'gallery']),
            ],
            'source_width' => ['nullable', 'integer', 'min:1', 'max:50000'],
            'source_height' => ['nullable', 'integer', 'min:1', 'max:50000'],
            'predicted_label' => ['required', Rule::in(Report::labels())],
            'confidence' => ['required', 'numeric', 'between:0,1'],
            'class_scores' => [
                'required',
                'array',
                'size:3',
                'required_array_keys:healthy,mosaic,rust',
            ],
            'class_scores.healthy' => ['required', 'numeric', 'between:0,1'],
            'class_scores.mosaic' => ['required', 'numeric', 'between:0,1'],
            'class_scores.rust' => ['required', 'numeric', 'between:0,1'],
            'symptom_keys' => ['required', 'array', 'min:1'],
            'symptom_keys.*' => [
                'string',
                'distinct',
                Rule::in(['mosaic', 'rust', 'none', 'unable-to-tell']),
            ],
            'checklist_consistency' => ['required', 'string', 'max:40'],
            'reported_severity' => ['nullable', 'string', 'max:20'],
            'quality_warnings' => ['present', 'array'],
            'quality_warnings.*' => [
                'string',
                'distinct',
                Rule::in([
                    'low-resolution',
                    'too-dark',
                    'too-bright',
                    'low-contrast',
                ]),
            ],
            'barangay' => ['required', 'string', 'max:120'],
            'model_version' => ['required', 'string', 'max:100'],
            'preprocess_ms' => ['required', 'numeric', 'min:0', 'max:999999999'],
            'inference_ms' => ['required', 'numeric', 'min:0', 'max:999999999'],
            'total_ms' => ['required', 'numeric', 'min:0', 'max:999999999'],
            'captured_at' => ['required', 'date'],
        ];
    }
}
