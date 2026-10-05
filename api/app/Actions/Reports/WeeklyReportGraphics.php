<?php

namespace App\Actions\Reports;

use Composer\InstalledVersions;

/** Static, escaped SVG only. Palette mirrors tokens.css; parity is tested. */
final class WeeklyReportGraphics
{
    public function assetDigest(): string
    {
        return hash('sha256', file_get_contents(resource_path('maps/nasugbu-barangays.geojson')).file_get_contents(resource_path('maps/report-bands.json')).file_get_contents(base_path('../brand/CaneGuard_logo_flat.svg')).file_get_contents(resource_path('views/reports/weekly-document.blade.php')).file_get_contents(__FILE__).RenderWeeklyReport::VERSION.InstalledVersions::getPrettyVersion('dompdf/dompdf'));
    }

    public function charts(array $content, ?string $disease = null): array
    {
        $rows = array_filter($content['diseases'], fn ($row) => $disease === null || $row['key'] === $disease);
        $charts = [['title' => 'Five-class status'.($disease ? ' · selected class' : ''), 'svg' => $this->status(array_values($rows))]];
        $barangayMax = max([1, ...array_column($content['barangays'], 'cases')]);
        foreach (array_chunk($content['barangays'] ?: [['barangay' => 'No cases received', 'cases' => 0]], 12) as $chunk) {
            $charts[] = ['title' => 'Cases by barangay · all weekly cases', 'svg' => $this->bars(array_map(fn ($row) => ['label' => $row['barangay'], 'value' => $row['cases'], 'band' => 1], $chunk), 'cases', $barangayMax)];
        }
        $charts[] = ['title' => 'Daily receipts · all weekly cases', 'svg' => $this->bars(array_map(fn ($row) => ['label' => $row['date'], 'value' => $row['count'], 'band' => 2], $content['trend']), 'cases')];
        $values = [];
        foreach ($content['hectares']['by_disease'] as $area) {
            if ($disease !== null && $disease !== $area['key']) {
                continue;
            }
            foreach ($content['barangays'] as $row) {
                if (isset($row['hectares_by_disease'][$area['key']])) {
                    $a = $row['hectares_by_disease'][$area['key']];
                    $label = $area['key'] === 'rssi' ? 'RSSI' : ucfirst($area['key']);
                    $values[] = ['label' => $label.' · '.$row['barangay'].' · estimate', 'value' => $a['estimate'], 'band' => 1];
                    $values[] = ['label' => $label.' · '.$row['barangay'].' · sum, may overlap', 'value' => $a['sum_may_overlap'], 'band' => 2];
                }
            }
        }
        $areaMax = max([1, ...array_column($values, 'value')]);
        foreach (array_chunk($values ?: [['label' => 'No area recorded', 'value' => 0, 'band' => 1]], 12) as $chunk) {
            $charts[] = ['title' => 'Affected hectares by barangay · per class', 'svg' => $this->bars($chunk, 'ha', $areaMax)];
        }

        return $charts;
    }

    private function status(array $rows): string
    {
        $palette = json_decode(file_get_contents(resource_path('maps/report-bands.json')), true, flags: JSON_THROW_ON_ERROR);
        $max = max(1, ...array_merge(array_column($rows, 'suspected'), array_column($rows, 'under_review'), array_column($rows, 'confirmed')));
        $svg = '';
        $states = ['suspected' => 1, 'under_review' => 2, 'confirmed' => 3];
        foreach ($states as $state => $band) {
            $x = ($band - 1) * 195;
            $svg .= '<rect x="'.$x.'" y="0" width="12" height="12" fill="'.$palette[$band].'" stroke="#ffffff" stroke-width="1" /><text x="'.($x + 18).'" y="10">'.ucfirst(str_replace('_', ' ', $state)).'</text>';
        }
        foreach ($rows as $i => $row) {
            $y = 26 + $i * 48;
            $svg .= '<text x="0" y="'.($y + 24).'">'.$this->escape($row['label']).'</text>';
            foreach ($states as $state => $band) {
                $by = $y + ($band - 1) * 14;
                $width = round(310 * $row[$state] / $max, 2);
                $svg .= '<rect x="230" y="'.$by.'" width="'.$width.'" height="12" fill="'.$palette[$band].'" stroke="#ffffff" stroke-width="1" /><text x="'.(546).'" y="'.($by + 10).'">'.$row[$state].'</text>';
            }
        }

        return $this->svg($svg, 610, 26 + count($rows) * 48);
    }

    private function bars(array $rows, string $unit, ?float $maxValue = null): string
    {
        $palette = json_decode(file_get_contents(resource_path('maps/report-bands.json')), true, flags: JSON_THROW_ON_ERROR);
        $height = max(48, count($rows) * 22 + 12);
        $max = $maxValue ?? max([1, ...array_column($rows, 'value')]);
        $svg = '';
        foreach ($rows as $i => $row) {
            $y = 6 + $i * 22;
            $width = round(245 * $row['value'] / $max, 2);
            $svg .= '<text x="0" y="'.($y + 12).'">'.$this->escape(mb_strimwidth($row['label'], 0, 46, '…')).'</text>';
            $svg .= '<rect x="285" y="'.$y.'" width="'.$width.'" height="14" fill="'.$palette[$row['band']].'" stroke="#ffffff" stroke-width="1" />';
            $svg .= '<text x="'.(291 + $width).'" y="'.($y + 12).'">'.$this->escape((string) $row['value'].' '.$unit).'</text>';
        }

        return $this->svg($svg, 610, $height);
    }

    public function map(array $content): array
    {
        $features = json_decode(file_get_contents(resource_path('maps/nasugbu-barangays.geojson')), true, flags: JSON_THROW_ON_ERROR)['features'];
        $palette = json_decode(file_get_contents(resource_path('maps/report-bands.json')), true, flags: JSON_THROW_ON_ERROR);
        $ink = $palette[2];
        $all = [];
        foreach ($features as $feature) {
            $polygons = $feature['geometry']['type'] === 'Polygon' ? [$feature['geometry']['coordinates']] : $feature['geometry']['coordinates'];
            foreach ($polygons as $polygon) {
                foreach ($polygon as $ring) {
                    array_push($all, ...$ring);
                }
            }
        }
        $xmin = min(array_column($all, 0));
        $xmax = max(array_column($all, 0));
        $ymin = min(array_column($all, 1));
        $ymax = max(array_column($all, 1));
        $scale = min(570 / (($xmax - $xmin) * cos(deg2rad(($ymin + $ymax) / 2))), 320 / ($ymax - $ymin));
        $project = fn ($point) => [round(18 + ($point[0] - $xmin) * cos(deg2rad(($ymin + $ymax) / 2)) * $scale, 2), round(18 + ($ymax - $point[1]) * $scale, 2)];
        $svg = '';
        foreach ($features as $feature) {
            $polygons = $feature['geometry']['type'] === 'Polygon' ? [$feature['geometry']['coordinates']] : $feature['geometry']['coordinates'];
            foreach ($polygons as $polygon) {
                $path = '';
                foreach ($polygon as $ring) {
                    foreach ($ring as $i => $point) {
                        [$x, $y] = $project($point);
                        $path .= ($i === 0 ? 'M' : 'L').$x.' '.$y.' ';
                    }
                    $path .= 'Z ';
                }
                $svg .= '<path d="'.$path.'" fill="#ffffff" fill-rule="evenodd" stroke="'.$ink.'" stroke-width="0.6" />';
            }
        }
        $outside = 0;
        foreach ($content['map']['clusters'] as $point) {
            if ($point['longitude'] < $xmin || $point['longitude'] > $xmax || $point['latitude'] < $ymin || $point['latitude'] > $ymax) {
                $outside += $point['cases'];

                continue;
            }
            [$x, $y] = $project([$point['longitude'], $point['latitude']]);
            $svg .= '<circle cx="'.$x.'" cy="'.$y.'" r="8" fill="'.$ink.'" stroke="#ffffff" stroke-width="1" />';
            $svg .= '<text x="'.$x.'" y="'.($y + 3).'" text-anchor="middle" fill="#ffffff">'.$point['cases'].'</text>';
        }
        $svg .= '<text x="570" y="18">N</text><path d="M575 24 L575 48 M571 29 L575 24 L579 29" fill="none" stroke="'.$ink.'" />';

        return ['svg' => $this->svg($svg, 610, 365), 'outside_reference_extent' => $outside];
    }

    private function svg(string $body, int $width, int $height): string
    {
        $palette = json_decode(file_get_contents(resource_path('maps/report-bands.json')), true, flags: JSON_THROW_ON_ERROR);

        return '<svg xmlns="http://www.w3.org/2000/svg" width="'.$width.'" height="'.$height.'" viewBox="0 0 '.$width.' '.$height.'"><g font-family="DejaVu Sans" font-size="10" fill="'.$palette[2].'">'.$body.'</g></svg>';
    }

    private function escape(string $text): string
    {
        return htmlspecialchars($text, ENT_QUOTES | ENT_XML1, 'UTF-8');
    }
}
