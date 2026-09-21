<?php

namespace App\Actions\Notifications;

use App\Models\Advisory;
use App\Models\FieldValidationAssignment;
use App\Models\FieldValidationCompletion;
use App\Models\Report;
use App\Models\ReportReferral;
use App\Models\User;
use App\Notifications\AdvisoryAvailableNotification;
use App\Notifications\CaseAttentionNotification;
use App\Notifications\ExpertReferralAssignedNotification;
use App\Notifications\ExpertReferralDueSoonNotification;
use App\Notifications\ExpertReferralOverdueNotification;
use App\Notifications\ExpertReferralResponseReceivedNotification;
use App\Notifications\FieldValidationAssignedNotification;
use App\Notifications\FieldValidationAssignmentChangedNotification;
use App\Notifications\FieldValidationCompletedNotification;
use App\Notifications\FollowUpDueNotification;
use App\Notifications\OfficeReviewCompletedNotification;
use Carbon\CarbonImmutable;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Notifications\DatabaseNotification;

class CreateLifecycleNotifications
{
    public function __construct(
        private readonly BroadcastCaseAttentionChanged $broadcast,
    ) {}

    public function assignmentCreated(FieldValidationAssignment $assignment): void
    {
        $assignment->loadMissing(['report', 'assignee']);
        $report = $assignment->report;
        $targetVisitDate = $this->targetVisitDate($assignment);

        $this->send(
            $assignment->assignee,
            new FieldValidationAssignedNotification(
                $assignment->assignee->uuid,
                $report->uuid,
                $report->reference_code,
                $assignment->uuid,
                $targetVisitDate,
            ),
        );
        $this->broadcast->handleOfficeUsers(FieldValidationAssignedNotification::EVENT_TYPE);
    }

    public function assignmentChanged(FieldValidationAssignment $assignment, string $changeKey): void
    {
        $assignment->loadMissing(['report', 'assignee']);
        $report = $assignment->report;
        $targetVisitDate = $this->targetVisitDate($assignment);

        $this->send(
            $assignment->assignee,
            new FieldValidationAssignmentChangedNotification(
                $assignment->assignee->uuid,
                $report->uuid,
                $report->reference_code,
                $assignment->uuid,
                $targetVisitDate,
                $changeKey,
            ),
        );
        $this->broadcast->handleOfficeUsers(FieldValidationAssignmentChangedNotification::EVENT_TYPE);
    }

    public function fieldValidationCompleted(
        FieldValidationAssignment $assignment,
        FieldValidationCompletion $completion,
    ): void {
        $assignment->loadMissing(['report']);
        $report = $assignment->report;

        User::query()
            ->whereIn('role', User::officeRoles())
            ->get()
            ->each(function (User $recipient) use ($assignment, $completion, $report): void {
                $this->send(
                    $recipient,
                    new FieldValidationCompletedNotification(
                        $recipient->uuid,
                        $report->uuid,
                        $report->reference_code,
                        $assignment->uuid,
                        $completion->uuid,
                    ),
                );
                $this->broadcast->handle($recipient, FieldValidationCompletedNotification::EVENT_TYPE);
            });
    }

    public function expertReferralAssigned(ReportReferral $referral): void
    {
        $referral->loadMissing(['report', 'expert']);
        $report = $referral->report;
        $expert = $referral->expert;

        if ($report === null || $expert === null || ! $expert->isExpert()) {
            return;
        }

        $this->send(
            $expert,
            new ExpertReferralAssignedNotification(
                $expert->uuid,
                $report->uuid,
                $report->reference_code,
                $referral,
            ),
        );
    }

    public function expertReferralResponseReceived(Report $report): void
    {
        $report->loadMissing(['referral']);
        $responseDate = $report->referral?->response_date?->format('Y-m-d');
        if ($responseDate === null) {
            return;
        }

        User::query()
            ->whereIn('role', User::officeRoles())
            ->get()
            ->each(function (User $recipient) use ($report, $responseDate): void {
                $notification = new ExpertReferralResponseReceivedNotification(
                    $recipient->uuid,
                    $report->uuid,
                    $report->reference_code,
                    $responseDate,
                    (string) $report->lock_version,
                );
                $this->send($recipient, $notification);
                $this->broadcast->handle($recipient, ExpertReferralResponseReceivedNotification::EVENT_TYPE);
            });
    }

    /**
     * Create one database reminder for each active consult and reminder state.
     * Dates are compared in the configured application timezone.
     */
    public function ensureExpertReferralReminderNotifications(): int
    {
        $today = CarbonImmutable::now()->startOfDay();
        $created = 0;

        ReportReferral::query()
            ->whereIn('consult_status', ReportReferral::activeStatuses())
            ->whereNotNull('due_date')
            ->whereDate('due_date', $today->addDay()->toDateString())
            ->with(['report', 'expert'])
            ->each(function (ReportReferral $referral) use (&$created): void {
                $report = $referral->report;
                $expert = $referral->expert;
                if ($report === null || $expert === null || ! $expert->isExpert()) {
                    return;
                }

                $notification = new ExpertReferralDueSoonNotification(
                    $expert->uuid,
                    $report->uuid,
                    $report->reference_code,
                    $referral,
                );
                if (! DatabaseNotification::query()->whereKey($notification->id)->exists()) {
                    $this->send($expert, $notification);
                    $created++;
                }
            });

        ReportReferral::query()
            ->whereIn('consult_status', ReportReferral::activeStatuses())
            ->whereNotNull('due_date')
            ->whereDate('due_date', '<', $today->toDateString())
            ->with(['report', 'expert'])
            ->each(function (ReportReferral $referral) use (&$created): void {
                $report = $referral->report;
                if ($report === null) {
                    return;
                }

                if ($referral->expert?->isExpert()) {
                    $notification = new ExpertReferralOverdueNotification(
                        $referral->expert->uuid,
                        $report->uuid,
                        $report->reference_code,
                        $referral,
                    );
                    if (! DatabaseNotification::query()->whereKey($notification->id)->exists()) {
                        $this->send($referral->expert, $notification);
                        $created++;
                    }
                }

                User::query()
                    ->whereIn('role', User::officeRoles())
                    ->get()
                    ->each(function (User $recipient) use ($referral, $report, &$created): void {
                        $notification = new ExpertReferralOverdueNotification(
                            $recipient->uuid,
                            $report->uuid,
                            $report->reference_code,
                            $referral,
                            officeRecipient: true,
                        );
                        if (! DatabaseNotification::query()->whereKey($notification->id)->exists()) {
                            $this->send($recipient, $notification);
                            $created++;
                        }
                    });
            });

        return $created;
    }

    public function advisorySelected(Report $report, Advisory $advisory): void
    {
        $report->loadMissing(['reporter']);
        $recipient = $report->reporter;
        if ($recipient === null || $recipient->role !== User::ROLE_FIELD_REPORTER) {
            return;
        }

        $notification = new AdvisoryAvailableNotification(
            $recipient->uuid,
            $report->uuid,
            $report->reference_code,
            $advisory,
            (string) $report->lock_version,
        );
        $this->send($recipient, $notification);

        // A database notification and the v3 status snapshot are the two
        // agreed delivery channels. Mark the case delivered only after the
        // durable notification exists; retries remain idempotent by key.
        $report->newQuery()->whereKey($report->getKey())->update([
            'advisory_delivery_state' => Report::ADVISORY_DELIVERY_DELIVERED,
            'advisory_delivered_at' => now()->utc(),
        ]);
    }

    public function officeReviewCompleted(Report $report): void
    {
        $report->loadMissing(['reporter', 'fieldValidationAssignment.assignee']);
        $recipients = collect([$report->reporter, $report->fieldValidationAssignment?->assignee])
            ->filter(fn (?User $user): bool => $user?->role === User::ROLE_FIELD_REPORTER)
            ->unique(fn (User $user): string => (string) $user->getKey());

        foreach ($recipients as $recipient) {
            $this->send(
                $recipient,
                new OfficeReviewCompletedNotification(
                    $recipient->uuid,
                    $report->uuid,
                    $report->reference_code,
                    $report->fieldValidationAssignment?->uuid,
                    (string) $report->lock_version,
                ),
            );
        }
        $this->broadcast->handleOfficeUsers(OfficeReviewCompletedNotification::EVENT_TYPE);
    }

    /**
     * Derive overdue attention when a notification feed is read. This avoids
     * inventing a service-level deadline or requiring a scheduler for a rule
     * that depends only on the assignment target date and current state.
     */
    public function ensureFollowUpDueNotifications(): int
    {
        $today = CarbonImmutable::now()->startOfDay();
        $created = 0;

        FieldValidationAssignment::query()
            ->whereNotNull('target_visit_date')
            ->whereDate('target_visit_date', '<', $today->toDateString())
            ->whereHas('report', function ($query): void {
                $query
                    ->where('case_state', Report::CASE_STATE_OPEN)
                    ->where(
                        'field_validation_state',
                        '!=',
                        Report::FIELD_VALIDATION_STATE_COMPLETED,
                    );
            })
            ->with(['report', 'assignee'])
            ->each(function (FieldValidationAssignment $assignment) use (&$created): void {
                $report = $assignment->report;
                $targetVisitDate = $this->targetVisitDate($assignment);
                if ($targetVisitDate === null) {
                    return;
                }

                $recipients = User::query()
                    ->where(function ($query) use ($assignment): void {
                        $query
                            ->whereKey($assignment->assignee_id)
                            ->orWhereIn('role', User::officeRoles());
                    })
                    ->get();

                foreach ($recipients as $recipient) {
                    $notification = new FollowUpDueNotification(
                        $recipient->uuid,
                        $report->uuid,
                        $report->reference_code,
                        $assignment->uuid,
                        $targetVisitDate,
                    );
                    $before = DatabaseNotification::query()
                        ->whereKey($notification->id)
                        ->exists();
                    $this->send($recipient, $notification);
                    if (! $before) {
                        $created++;
                        $this->broadcast->handle($recipient, FollowUpDueNotification::EVENT_TYPE);
                    }
                }
            });

        return $created;
    }

    private function send(User $recipient, CaseAttentionNotification $notification): void
    {
        if (DatabaseNotification::query()->whereKey($notification->id)->exists()) {
            return;
        }

        try {
            $recipient->notify($notification);
        } catch (UniqueConstraintViolationException $exception) {
            if (! DatabaseNotification::query()->whereKey($notification->id)->exists()) {
                throw $exception;
            }
        }
    }

    private function targetVisitDate(FieldValidationAssignment $assignment): ?string
    {
        return $assignment->target_visit_date?->format('Y-m-d');
    }
}
