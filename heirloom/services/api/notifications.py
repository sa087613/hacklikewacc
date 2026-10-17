from typing import Optional

import sqlalchemy as sa

from store.schema import new_id, notifications


def notify(conn: sa.Connection, person_id: Optional[str], kind: str, title: str, body: str = "", link: Optional[str] = None):
    if not person_id:
        return
    conn.execute(notifications.insert().values(
        id=new_id(), person_id=person_id, kind=kind, title=title, body=body, link=link))
