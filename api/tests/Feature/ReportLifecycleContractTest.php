<?php

namespace Tests\Feature;

use App\Contracts\ReportLifecycleContract;
use App\Models\Report;
use Tests\TestCase;

class ReportLifecycleContractTest extends TestCase
{
    public function test_report_model_uses_the_canonical_lifecycle_artifact(): void
    {
        $definition = ReportLifecycleContract::definition();

        $this->assertSame('report-lifecycle-v1', $definition['contract']);
        $this->assertSame(1, $definition['version']);
        $this->assertSame(
            ['case_state', 'verification_outcome', 'field_validation_state', 'referral_state'],
            array_keys($definition['dimensions']),
        );

        $this->assertSame(
            $definition['dimensions']['case_state']['values'],
            Report::caseStates(),
        );
        $this->assertSame(
            $definition['dimensions']['verification_outcome']['values'],
            Report::verificationOutcomes(),
        );
        $this->assertSame(
            $definition['dimensions']['field_validation_state']['values'],
            Report::fieldValidationStates(),
        );
        $this->assertSame(
            $definition['dimensions']['referral_state']['values'],
            Report::referralStates(),
        );
    }

    public function test_legacy_projection_and_authority_rules_preserve_phase_one_safety(): void
    {
        $definition = ReportLifecycleContract::definition();

        foreach ($definition['legacy_projection'] as $status => $expected) {
            $actual = Report::lifecycleForReviewStatus(
                $status === 'unknown' ? 'unexpected_legacy_status' : $status,
            );
            $this->assertSame($expected, $actual, "Unexpected legacy projection for {$status}.");
        }

        $rules = ReportLifecycleContract::rules();
        $this->assertTrue($rules['verification_does_not_close_case']);
        $this->assertTrue($rules['field_validation_completion_does_not_verify_or_close']);
        $this->assertTrue($rules['referral_is_not_verification_outcome']);
        $this->assertTrue($rules['field_reporter_can_complete_assignment']);
        $this->assertFalse($rules['field_reporter_can_close_case']);
        $this->assertTrue($rules['completed_validation_cannot_be_reassigned_or_removed']);
        $this->assertSame(['reviewer', 'admin'], $rules['final_disposition_roles']);
        $this->assertSame('decision_support_only', $rules['ai_evidence_role']);
    }

    public function test_lifecycle_payload_contracts_follow_the_current_mobile_transport(): void
    {
        $this->assertSame([
            'mobile-report-upload-v2',
            'mobile-field-validation-assignment-v1',
            'mobile-field-validation-completion-v1',
            'mobile-notifications-v1',
        ], ReportLifecycleContract::definition()['payload_contracts']);
    }
}
