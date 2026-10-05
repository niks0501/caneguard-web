<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['report_id', 'recorded_by_id', 'destination', 'reference', 'sent_date', 'note', 'advice_received_note', 'created_at'])]
class ReportHandoffNote extends Model
{
    public $timestamps = false;

    protected function casts(): array
    {
        return ['sent_date' => 'immutable_date', 'created_at' => 'immutable_datetime'];
    }
}
