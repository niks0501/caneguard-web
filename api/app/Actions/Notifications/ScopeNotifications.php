<?php

namespace App\Actions\Notifications;

use App\Models\Report;
use App\Models\User;
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

        return $query->whereIn('data->report_uuid', $reports->select('reports.uuid'));
    }
}
