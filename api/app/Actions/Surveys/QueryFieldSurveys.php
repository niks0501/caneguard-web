<?php

namespace App\Actions\Surveys;

use App\Models\FieldSurvey;
use App\Models\Report;
use App\Security\DistrictAccess;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;

class QueryFieldSurveys
{
    private const TIMEZONE = 'Asia/Manila';

    public function __construct(private readonly DistrictAccess $districtAccess) {}

    /**
     * Bounded, page-based lookup so an older boundary can be found without
     * downloading the whole archive. `search` accepts a boundary id, an ISO
     * capture date, or an inspector name; nothing is inferred from location.
     *
     * @param  array<string, mixed>  $filters
     * @return array{surveys: Collection<int, FieldSurvey>, total_count: int, limit: int, returned_count: int, truncated: bool, page: int, page_count: int}
     */
    public function handle(array $filters): array
    {
        $limit = (int) ($filters['limit'] ?? config('caneguard.surveys.read_default_limit', 100));
        $page = max(1, (int) ($filters['page'] ?? 1));
        $search = trim((string) ($filters['search'] ?? ''));
        $districtId = $this->districtAccess->pilotId();
        $query = FieldSurvey::query();

        if ($districtId === null) {
            $query->whereRaw('1 = 0');
        } else {
            $query->where('district_id', $districtId);
        }

        $this->applySearch($query, $search);

        $totalCount = (clone $query)->count();
        $pageCount = max(1, (int) ceil($totalCount / max(1, $limit)));
        $page = min($page, $pageCount);
        $offset = ($page - 1) * $limit;

        $surveys = $query
            ->with('inspector:id,uuid,name')
            ->orderByDesc('captured_at')
            ->orderByDesc('id')
            ->offset($offset)
            ->limit($limit + 1)
            ->get([
                'id', 'client_uuid', 'inspector_id', 'polygon', 'area_sqm',
                'affected_area_polygons', 'affected_area_sqm', 'captured_at',
            ]);
        $hasMore = $surveys->count() > $limit;

        if ($hasMore) {
            $surveys->pop();
        }

        if ($districtId !== null) {
            $this->attachCaseLinks($surveys, $districtId);
        }

        return [
            'surveys' => $surveys,
            'total_count' => $totalCount,
            'limit' => $limit,
            'returned_count' => $surveys->count(),
            'truncated' => $hasMore,
            'page' => $page,
            'page_count' => $pageCount,
        ];
    }

    /**
     * Mark each boundary with the cases that use it: `confirmed` when the office
     * linked it with a loss rate, `attached` when only the inspector attached it
     * on the phone. A boundary the office confirmed is never listed twice.
     *
     * @param  Collection<int, FieldSurvey>  $surveys
     */
    private function attachCaseLinks(Collection $surveys, int $districtId): void
    {
        if ($surveys->isEmpty()) {
            return;
        }

        $links = [];
        $confirmed = Report::query()
            ->where('district_id', $districtId)
            ->join('report_affected_field_surveys', 'report_affected_field_surveys.report_id', '=', 'reports.id')
            ->whereIn('report_affected_field_surveys.field_survey_id', $surveys->modelKeys())
            ->orderBy('reports.id')
            ->get(['reports.uuid', 'reports.reference_code', 'report_affected_field_surveys.field_survey_id']);
        foreach ($confirmed as $report) {
            $links[(int) $report->field_survey_id][$report->uuid] = [
                'uuid' => $report->uuid,
                'reference_code' => $report->reference_code,
                'link' => 'confirmed',
            ];
        }

        $byClientUuid = $surveys->keyBy('client_uuid');
        $attached = Report::query()
            ->where('district_id', $districtId)
            ->whereIn('field_survey_client_uuid', $byClientUuid->keys()->all())
            ->orderBy('id')
            ->get(['uuid', 'reference_code', 'field_survey_client_uuid']);
        foreach ($attached as $report) {
            $surveyId = (int) $byClientUuid->get($report->field_survey_client_uuid)->getKey();
            $links[$surveyId][$report->uuid] ??= [
                'uuid' => $report->uuid,
                'reference_code' => $report->reference_code,
                'link' => 'attached',
            ];
        }

        foreach ($surveys as $survey) {
            $survey->setAttribute('case_links', array_values($links[(int) $survey->getKey()] ?? []));
        }
    }

    private function applySearch(Builder $query, string $search): void
    {
        if ($search === '') {
            return;
        }

        if (ctype_digit($search)) {
            $query->whereKey((int) $search);

            return;
        }

        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $search) === 1) {
            // Capture dates are shown in Asia/Manila but stored in UTC. An
            // impossible date matches nothing instead of rolling into another day.
            $startOfDay = CarbonImmutable::createFromFormat('!Y-m-d', $search, self::TIMEZONE);
            if ($startOfDay === false || $startOfDay->format('Y-m-d') !== $search) {
                $query->whereRaw('1 = 0');

                return;
            }
            $query->where('captured_at', '>=', $startOfDay->utc())
                ->where('captured_at', '<', $startOfDay->addDay()->utc());

            return;
        }

        $escaped = addcslashes($search, '%_\\');
        $query->whereHas('inspector', static function ($inspector) use ($escaped): void {
            $inspector->where('name', 'like', '%'.$escaped.'%');
        });
    }
}
