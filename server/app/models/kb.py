"""Knowledge base cho chatbot RAG: KbDocument, KbChunk, ChatLog.

Theo A7: kb_documents 1-N kb_chunks; chat_logs N-1 users va luu `sources`
(cac trich dan tai lieu da dung de tra loi).

Luu y embedding: cot `embedding` dung db.JSON (list[float]) de tuong thich
ca SQLite (dev/test) va PostgreSQL. Khi len production voi PostgreSQL,
chuyen cot nay sang pgvector (Vector(1536)) + index HNSW/IVFFlat theo
ghi chu trong A7 — pipeline RAG khong doi, chi doi lop luu tru.
"""
from app.extensions import db
from app.models.users import TimestampMixin


class KbDocument(TimestampMixin, db.Model):
    __tablename__ = "kb_documents"

    STATUS_PROCESSING = "processing"
    STATUS_READY = "ready"
    STATUS_FAILED = "failed"
    STATUSES = (STATUS_PROCESSING, STATUS_READY, STATUS_FAILED)

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(255), nullable=False)
    file_url = db.Column(db.String(500), nullable=True)
    uploaded_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    status = db.Column(
        db.String(20), nullable=False, default=STATUS_PROCESSING, index=True
    )

    uploader = db.relationship("User", foreign_keys=[uploaded_by])
    chunks = db.relationship(
        "KbChunk", back_populates="document", cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<KbDocument id={self.id} title={self.title!r} status={self.status!r}>"


class KbChunk(TimestampMixin, db.Model):
    __tablename__ = "kb_chunks"

    id = db.Column(db.Integer, primary_key=True)
    document_id = db.Column(
        db.Integer, db.ForeignKey("kb_documents.id"), nullable=False, index=True
    )
    chunk_text = db.Column(db.Text, nullable=False)
    chunk_index = db.Column(db.Integer, nullable=False, default=0)
    page_no = db.Column(db.Integer, nullable=True)
    # JSON list[float] khi dev/SQLite — production: pgvector (xem docstring file).
    embedding = db.Column(db.JSON, nullable=True)

    document = db.relationship("KbDocument", back_populates="chunks")

    def __repr__(self):
        return f"<KbChunk id={self.id} document_id={self.document_id} page={self.page_no}>"


class ChatLog(TimestampMixin, db.Model):
    __tablename__ = "chat_logs"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=False, index=True
    )
    question = db.Column(db.Text, nullable=False)
    answer = db.Column(db.Text, nullable=True)
    sources = db.Column(db.JSON, nullable=True)  # [{document_id, title, page_no, chunk_id}]

    user = db.relationship("User", back_populates="chat_logs")

    def __repr__(self):
        return f"<ChatLog id={self.id} user_id={self.user_id}>"
