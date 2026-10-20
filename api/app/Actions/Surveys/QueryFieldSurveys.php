<?php

namespace App\Actions\Surveys;

use App\Models\FieldSurvey;
use App\Security\DistrictAccess;
use Illuminate\Database\Eloquent\Collection;

class QueryFieldSurveys
{
    public function __construct(private readonly DistrictAccess $districtAccess) {}

    /**
     * @param  array<string, mixed>  $filters
     * @return array{surveys: Collection<int, FieldSurvey>, total_count: int, limit: int, returned_count: int, truncated: bool}
     */
    public function handle(array $filters): array
    {
        $limit = (int) ($filters['limit'] ?? config('caneguard.surveys.read_default_limit', 100));
        $districtId = $this->districtAccess->pilotId();
        $query = FieldSurvey::query();

        if ($districtId === null) {
            $query->whereRaw('1 = 0');
        } else {
            $query->where('district_id', $districtId);
        }

        $totalCount = (clone $query)->count();
        $surveys = $query
            ->with('inspector:id,uuid,name')
            ->orderByDesc('captured_at')
            ->orderByDesc('id')
            ->limit($limit + 1)
            ->get(['id', 'inspector_id', 'polygon', 'area_sqm', 'captured_at']);
        $truncated = $surveys->count() > $limit;

        if ($truncated) {
            $surveys->pop();
        }

        return [
            'surveys' => $surveys,
            'total_count' => $totalCount,
            'limit' => $limit,
            'returned_count' => $surveys->count(),
            'truncated' => $truncated,
        ];
    }
}
