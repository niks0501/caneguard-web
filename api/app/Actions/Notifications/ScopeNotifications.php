<?php

namespace App\Actions\Notifications;

use App\Models\Report;
use App\Models\User;
use App\Notifications\FieldValidationAssignmentReassignedNotification;
use App\Notifications\WeeklyReportReminderNotification;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\Relation;

final class ScopeNotifications
{
    public function handle(Builder|Relation $query, User $user): Builder|Relation
    {
        $reports = Report::query()->visibleTo($user, false);
        if ($user->role === User::ROLE_FIELD_REPORTER) {
            $reports->where(function (Builder $reports) use ($user): void {
                $reports->where('reporter_id', $user->getKey())
                    ->orWhereHas('fieldValidationAssignment', fn (Builder $assignments) => $assignments->where('assignee_id', $user->getKey()));
            });
        }

        return $query->where(function (Builder $scoped) use ($reports, $user): void {
            $scoped->whereIn('data->report_uuid', $reports->select('reports.uuid'))
                ->orWhere(function (Builder $reassigned) use ($user): void {
                    $reassigned->where('data->event_type', FieldValidationAssignmentReassignedNotification::EVENT_TYPE)
                        ->where('notifiable_type', $user->getMorphClass())
                        ->where('notifiable_id', $user->getKey());
                });
            if (in_array($user->role, User::officeRoles(), true)) {
                $scoped->orWhere('data->event_type', WeeklyReportReminderNotification::EVENT_TYPE);
            }
        });
    }
}
