"""Kleiner geteilter Laufzeit-Zustand, um zirkuläre Importe zu vermeiden.

Wird in main.on_startup gesetzt. awaiting_edit ist bewusst nicht persistent
(nur der kurze Moment zwischen ✏️-Tap und Text-Eingabe; Verlust bei Restart = ok).
"""

bot = None

# user_id -> draft_id, für den Editier-Dialog ("sende mir den neuen Text")
awaiting_edit: dict[int, int] = {}


def set_bot(b):
    global bot
    bot = b
