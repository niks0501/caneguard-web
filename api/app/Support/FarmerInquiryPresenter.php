<?php

namespace App\Support;

use App\Models\FarmerInquiry;
use App\Models\FarmerInquiryReply;

/** Wire shapes for a farmer request: what the farmer sees, and what the office sees. */
final class FarmerInquiryPresenter
{
    /** @return array<string, mixed> */
    public static function farmer(FarmerInquiry $inquiry): array
    {
        return [
            'uuid' => $inquiry->uuid,
            'client_uuid' => $inquiry->client_uuid,
            'status' => $inquiry->status,
            'barangay' => $inquiry->barangay,
            'landmark' => $inquiry->landmark,
            'concern' => $inquiry->concern,
            'note' => $inquiry->note,
            'photos' => self::photos($inquiry, fn (int $position) => "/api/v1/mobile/farmer/inquiries/{$inquiry->uuid}/photos/{$position}"),
            // The farmer hears from "the office", never from a named person.
            'replies' => $inquiry->replies->map(fn (FarmerInquiryReply $reply) => self::reply($reply))->all(),
            'created_at' => $inquiry->created_at?->toISOString(),
            'replied_at' => $inquiry->replied_at?->toISOString(),
        ];
    }

    /** @return array<string, mixed> */
    public static function office(FarmerInquiry $inquiry): array
    {
        return [
            'uuid' => $inquiry->uuid,
            'status' => $inquiry->status,
            'lock_version' => $inquiry->lock_version,
            'farmer' => ['uuid' => $inquiry->farmer->uuid, 'name' => $inquiry->farmer->name],
            'barangay' => $inquiry->barangay,
            'landmark' => $inquiry->landmark,
            'concern' => $inquiry->concern,
            'note' => $inquiry->note,
            // The phone's own on-device scan result: never confirmed, never a diagnosis.
            'ai_hint' => $inquiry->ai_label === null ? null : [
                'label' => $inquiry->ai_label,
                'confidence_percent' => $inquiry->ai_confidence_percent,
                'verified' => false,
            ],
            'photos' => self::photos($inquiry, fn (int $position) => "/api/v1/farmer-inquiries/{$inquiry->uuid}/photos/{$position}"),
            'replies' => $inquiry->replies->map(fn (FarmerInquiryReply $reply) => self::reply($reply) + ['author_name' => $reply->author?->name])->all(),
            'reviewed_by' => $inquiry->reviewer?->name,
            'created_at' => $inquiry->created_at?->toISOString(),
            'replied_at' => $inquiry->replied_at?->toISOString(),
        ];
    }

    /** @return array<string, mixed> */
    private static function reply(FarmerInquiryReply $reply): array
    {
        return [
            'uuid' => $reply->uuid,
            'kind' => $reply->kind,
            'body' => $reply->body,
            'advisory_title' => $reply->advisory_title,
            'created_at' => $reply->created_at?->toISOString(),
        ];
    }

    /** @return array<int, array{position: int, url: string, content_type: string, bytes: int}> */
    private static function photos(FarmerInquiry $inquiry, \Closure $url): array
    {
        return $inquiry->photos->map(fn ($photo) => [
            'position' => (int) $photo->position,
            'url' => $url((int) $photo->position),
            'content_type' => $photo->mime_type,
            'bytes' => (int) $photo->size_bytes,
        ])->all();
    }
}
