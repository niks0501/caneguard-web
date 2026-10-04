<?php

namespace Database\Factories;

use App\Models\Report;
use App\Models\ReportReferral;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ReportReferral>
 */
class ReportReferralFactory extends Factory
{
    protected $model = ReportReferral::class;

    public function definition(): array
    {
        $reviewer = User::factory()->reviewer();

        return [
            'report_id' => Report::factory()->state([
                'case_state' => Report::CASE_STATE_OPEN,
                'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
                'referral_state' => Report::REFERRAL_STATE_REFERRED,
                'action_taken' => Report::ACTION_REFERRED_FOR_EXPERT_VALIDATION,
            ]),
            'referred_by_id' => $reviewer,
            'expert_id' => null,
            'destination' => 'Regional crop protection office',
            'reference' => 'SRA-'.fake()->unique()->numerify('######'),
            'referral_date' => now()->toDateString(),
            'due_date' => now()->addDays(7)->toDateString(),
            'expert_name' => null,
            'expert_contact' => null,
            'invite_token_hash' => null,
            'invite_issued_at' => null,
            'invite_expires_at' => null,
            'invite_revoked_at' => null,
            'invite_access_count' => 0,
            'invite_first_accessed_at' => null,
            'invite_last_accessed_at' => null,
            'share_full_context' => false,
            'note' => 'Please review the submitted evidence and observations.',
            'consult_status' => ReportReferral::STATUS_PENDING,
            'response_date' => null,
            'response_note' => null,
            'response_finding' => null,
            'response_recorded_by_id' => null,
            'response_recorded_at' => null,
            'finding_summary' => null,
            'condition_opinion' => null,
            'symptom_verdicts' => null,
            'finding_details' => null,
            'finding_confidence' => null,
            'finding_recommendation' => null,
            'finding_source' => null,
            'finding_recorded_by_id' => null,
            'finding_recorded_at' => null,
            'consult_review_outcome' => null,
            'consult_review_note' => null,
            'consult_reviewed_by_id' => null,
            'consult_reviewed_at' => null,
            'office_case_state' => Report::CASE_STATE_OPEN,
            'office_verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
            'office_field_validation_state' => Report::FIELD_VALIDATION_STATE_UNASSIGNED,
            'office_action_taken' => Report::ACTION_REFERRED_FOR_EXPERT_VALIDATION,
            'office_authority_classified_condition' => null,
            'office_review_notes' => null,
            'office_reviewer_id' => null,
            'office_reviewed_at' => null,
        ];
    }
}
