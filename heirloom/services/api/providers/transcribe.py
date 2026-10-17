from typing import Optional

from config import settings


class TranscriptionUnavailable(Exception):
    pass


class TranscriptOnly:
    """Offline: voice notes must arrive with a typed transcript."""

    name = "transcript"
    live = False

    def transcribe(self, audio: bytes, filename: str) -> str:
        raise TranscriptionUnavailable(
            "Transcription is offline. Add OPENAI_API_KEY to enable Whisper, or send a transcript."
        )


class WhisperTranscriber:
    name = "whisper"
    live = True

    def __init__(self):
        from openai import OpenAI

        self.client = OpenAI(api_key=settings.openai_api_key)

    def transcribe(self, audio: bytes, filename: str) -> str:
        resp = self.client.audio.transcriptions.create(
            model=settings.transcription_model, file=(filename or "voice-note.webm", audio)
        )
        return resp.text


def resolve_transcript(transcript: Optional[str], audio: Optional[bytes], filename: str = "") -> str:
    """Prefer an explicit transcript; otherwise transcribe audio with the active provider."""
    from providers import get_transcriber

    if transcript and transcript.strip():
        return transcript.strip()
    if audio:
        return get_transcriber().transcribe(audio, filename)
    raise ValueError("Send an answer, a transcript, or an audio file.")
