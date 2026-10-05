<?php

namespace App\Http\Controllers\Api\V2;

use App\Actions\Auth\ManageAccounts;
use App\Http\Controllers\Controller;
use App\Models\AccountAccessEvent;
use App\Models\DistrictReportTransmission;
use App\Models\DistrictReportVersion;
use App\Security\AccountsDirectory;
use App\Security\DistrictAccess;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

final class AccountsController extends Controller
{
    public function index(Request $request, AccountsDirectory $directory): JsonResponse
    {
        $input = $request->validate([
            'view' => ['sometimes', Rule::in(['new', 'staff', 'farmers', 'revoked', 'all'])],
            'search' => ['sometimes', 'nullable', 'string', 'max:160'], 'role' => ['sometimes', Rule::in(['all', 'farmer', 'field_reporter', 'reviewer', 'admin'])],
            'verification' => ['sometimes', Rule::in(['all', 'verified', 'unverified'])],
            'membership' => ['sometimes', Rule::in(['all', 'not_issued', 'active', 'revoked'])],
            'sort' => ['sometimes', Rule::in(['newest', 'oldest'])], 'page' => ['sometimes', 'integer', 'min:1', 'max:100000'],
            'per_page' => ['sometimes', Rule::in([25, 50])],
        ]);
        $scope = $directory->scope();
        $total = (clone $scope)->count();
        $query = clone $scope;
        if (trim($input['search'] ?? '') !== '') {
            $term = '%'.str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], trim($input['search'])).'%';
            $query->where(fn ($q) => $q->where('name', 'like', $term)->orWhere('email', 'like', $term));
        }
        if (($input['role'] ?? 'all') !== 'all') {
            $query->where('role', $input['role']);
        }
        if (($input['verification'] ?? 'all') !== 'all') {
            $input['verification'] === 'verified' ? $query->whereNotNull('email_verified_at') : $query->whereNull('email_verified_at');
        }
        if (($input['membership'] ?? 'all') !== 'all') {
            $this->membership($query, $input['membership']);
        }
        $counts = [];
        foreach (['new', 'staff', 'farmers', 'revoked', 'all'] as $view) {
            $countQuery = clone $query;
            $this->view($countQuery, $view);
            $counts[$view] = $countQuery->count();
        }
        $this->view($query, $input['view'] ?? 'new');
        $direction = ($input['sort'] ?? 'newest') === 'oldest' ? 'asc' : 'desc';
        $page = $query->orderBy('created_at', $direction)->orderBy('id', $direction)->paginate($input['per_page'] ?? 25);

        return response()->json(['contract_version' => 'accounts-access-v1',
            'data' => $page->getCollection()->map(fn ($u) => $directory->detail($u, $request->user())),
            'meta' => ['page' => $page->currentPage(), 'per_page' => $page->perPage(), 'total' => $total, 'filtered_total' => $page->total(),
                'counts' => $counts, 'scope' => $directory->policy($request->user())]]);
    }

    public function show(Request $request, string $uuid, AccountsDirectory $directory): JsonResponse
    {
        $target = $directory->target($uuid);
        $data = $directory->detail($target, $request->user());
        $data['impact'] = [
            'historical_approvals' => DistrictReportVersion::query()->where('district_id', app(DistrictAccess::class)->pilotId())->where('approved_by_id', $target->id)->count(),
            'pending_deliveries' => DistrictReportTransmission::query()->where('state', 'pending')
                ->whereIn('district_report_version_id', DistrictReportVersion::query()->select('id')->where('district_id', app(DistrictAccess::class)->pilotId()))
                ->where(fn ($q) => $q->where('requested_by_id', $target->id)->orWhereIn('district_report_version_id', DistrictReportVersion::query()->select('id')->where('approved_by_id', $target->id)))->count(),
        ];

        return response()->json(['contract_version' => 'accounts-access-v1', 'data' => $data, 'policy' => $directory->policy($request->user())]);
    }

    public function events(Request $request, string $uuid, AccountsDirectory $directory): JsonResponse
    {
        $target = $directory->target($uuid);
        $request->validate(['page' => ['sometimes', 'integer', 'min:1', 'max:100000']]);
        $page = AccountAccessEvent::query()->where('target_id', $target->id)->where('district_id', app(DistrictAccess::class)->pilotId())
            ->orderByDesc('occurred_at')->orderByDesc('id')->paginate(25);

        return response()->json(['contract_version' => 'accounts-access-v1', 'data' => $page->getCollection()->map(fn ($e) => [
            'id' => $e->id, 'contract_version' => $e->contract_version, 'operation_id' => $e->operation_id,
            'target_uuid' => $target->uuid, 'actor' => $e->actor_snapshot, 'action' => $e->action,
            'office_reference' => $e->office_reference, 'before' => $e->before, 'after' => $e->after, 'occurred_at' => $e->occurred_at->toISOString(),
        ]), 'meta' => ['page' => $page->currentPage(), 'per_page' => $page->perPage(), 'total' => $page->total(),
            'history_completeness' => $target->registration_origin === 'public_signup' ? 'since_registration' : 'earlier_history_unavailable']]);
    }

    public function review(Request $request, string $uuid, ManageAccounts $accounts): JsonResponse
    {
        return response()->json($accounts->handle($request, 'review', $uuid));
    }

    public function transfer(Request $request, ManageAccounts $accounts): JsonResponse
    {
        return response()->json($accounts->handle($request, 'transfer'));
    }

    private function membership(Builder $query, string $state): void
    {
        if ($state === 'not_issued') {
            $query->whereDoesntHave('districtMemberships');
        } else {
            $query->whereHas('districtMemberships', fn ($q) => $state === 'active' ? $q->whereNull('revoked_at') : $q->whereNotNull('revoked_at'));
        }
    }

    private function view(Builder $query, string $view): void
    {
        if ($view === 'new') {
            $query->where('role', 'farmer')->whereIn('registration_origin', ['public_signup', 'office_certified'])->whereDoesntHave('districtMemberships')
                ->where(fn ($q) => $q->whereDoesntHave('accountReview')->orWhereHas('accountReview', fn ($r) => $r->where('disposition', 'new')));
        } elseif ($view === 'staff') {
            $query->whereIn('role', ['admin', 'reviewer', 'field_reporter']);
            $this->membership($query, 'active');
        } elseif ($view === 'farmers') {
            $query->where('role', 'farmer');
        } elseif ($view === 'revoked') {
            $this->membership($query, 'revoked');
        }
    }
}
