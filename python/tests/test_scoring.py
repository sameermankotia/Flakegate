from flakegate.config import Normalize
from flakegate.scoring import extract_answer, normalize_text, score_responses


def test_normalize_text_case_and_whitespace():
    normalize = Normalize(case_insensitive=True, collapse_whitespace=True)
    assert normalize_text("  Hello   World  ", normalize) == "hello world"


def test_normalize_text_strip_punctuation():
    normalize = Normalize(case_insensitive=False, strip_punctuation=True)
    assert normalize_text("Yes!", normalize) == "Yes"


def test_score_responses_all_agree():
    normalize = Normalize()
    result = score_responses(["Yes"] * 10, normalize, threshold=0.8)
    assert result.consistency_score == 1.0
    assert result.passed
    assert result.distinct_answers == 1


def test_score_responses_below_threshold():
    normalize = Normalize()
    responses = ["Yes"] * 5 + ["No"] * 5
    result = score_responses(responses, normalize, threshold=0.8)
    assert result.consistency_score == 0.5
    assert not result.passed
    assert result.distinct_answers == 2


def test_score_responses_majority_passes_threshold():
    normalize = Normalize()
    responses = ["Yes"] * 8 + ["No"] * 2
    result = score_responses(responses, normalize, threshold=0.8)
    assert result.consistency_score == 0.8
    assert result.passed
    assert result.majority_answer == "yes"


def test_extract_answer_with_capture_group():
    text = "Some reasoning...\nFinal answer: SHIPPING"
    assert extract_answer(text, r"Final answer:\s*(\w+)") == "SHIPPING"


def test_extract_answer_no_match_returns_original():
    text = "no marker here"
    assert extract_answer(text, r"Final answer:\s*(\w+)") == text


def test_extract_answer_none_pattern_is_noop():
    assert extract_answer("raw text", None) == "raw text"
