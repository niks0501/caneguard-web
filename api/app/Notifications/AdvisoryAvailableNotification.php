<?php

namespace App\Notifications;

use App\Models\Advisory;

class AdvisoryAvailableNotification extends CaseAttentionNotification
{
    public const EVENT_TYPE = 'advisory_available';

    public function __construct(
        string $recipientUuid,
        string $reportUuid,
        string $referenceCode,
        Advisory $advisory,
        string $selectionVersion,
        ?string $selectionGeneration = null,
    ) {
        parent::__construct(
            $recipientUuid,
            $reportUuid,
            $referenceCode,
            self::EVENT_TYPE,
            'New office advisory',
            "Office guidance is available for {$referenceCode}: {$advisory->title}.",
            null,
            'advisory-available|'.$reportUuid.'|'.$advisory->uuid.'|'.$selectionVersion,
        );

        $this->advisoryUuid = (string) $advisory->uuid;
        $this->advisoryCode = (string) $advisory->code;
        $this->advisoryTitle = (string) $advisory->title;
        $this->advisoryContent = (string) $advisory->content;
        $this->advisoryStatus = (string) $advisory->status;
        $this->selectedAt = now()->utc()->toISOString();
        $this->selectionGeneration = $selectionGeneration;
    }

    public readonly string $advisoryUuid;

    public readonly string $advisoryCode;

    public readonly string $advisoryTitle;

    public readonly string $advisoryContent;

    public readonly string $advisoryStatus;

    public readonly string $selectedAt;

    /** Marks which selection of the advisory this notification announces. */
    public readonly ?string $selectionGeneration;

    /** @return array<string, mixed> */
    protected function additionalData(): array
    {
        return [
            'content' => $this->advisoryContent,
            'advisory_uuid' => $this->advisoryUuid,
            'selection_generation' => $this->selectionGeneration,
            'advisory' => [
                'uuid' => $this->advisoryUuid,
                'code' => $this->advisoryCode,
                'title' => $this->advisoryTitle,
                'content' => $this->advisoryContent,
                'status' => $this->advisoryStatus,
                'selected_at' => $this->selectedAt,
            ],
        ];
    }
}
