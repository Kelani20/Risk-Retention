import pytest

from backend.app.models import OutreachStatus
from backend.app.store import InvalidOutreachTransition, next_outreach_status


def test_valid_outreach_transitions():
    assert (
        next_outreach_status(OutreachStatus.NOT_CONTACTED) is OutreachStatus.IN_PROGRESS
    )
    assert next_outreach_status(OutreachStatus.IN_PROGRESS) is OutreachStatus.RESOLVED


@pytest.mark.parametrize(
    ("current", "requested"),
    [
        (OutreachStatus.NOT_CONTACTED, OutreachStatus.RESOLVED),
        (OutreachStatus.IN_PROGRESS, OutreachStatus.NOT_CONTACTED),
    ],
)
def test_skipped_and_backward_transitions_are_rejected(current, requested):
    with pytest.raises(InvalidOutreachTransition):
        next_outreach_status(current, requested)


def test_resolved_is_terminal():
    assert next_outreach_status(OutreachStatus.RESOLVED) is None

    with pytest.raises(InvalidOutreachTransition):
        next_outreach_status(OutreachStatus.RESOLVED, OutreachStatus.IN_PROGRESS)
