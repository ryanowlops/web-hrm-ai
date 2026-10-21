"""Bảng tin nội bộ (feature-expansion-v4 mục 1): bài viết, lượt tim, bình luận.

- FeedPost: bài đăng của nhân viên (mọi role), HR/Admin có thể ghim lên đầu.
- FeedLike: 1 user tim 1 bài tối đa 1 lần (UNIQUE post_id + user_id) — API
  like là toggle dựa trên bảng này.
- FeedComment: bình luận thuộc bài viết; tác giả là User (không phải
  Employee) giống FeedPost.author_id để tài khoản Admin không gắn nhân
  viên vẫn tham gia được.
"""
from app.extensions import db
from app.models.users import TimestampMixin, utcnow


class FeedPost(TimestampMixin, db.Model):
    __tablename__ = "feed_posts"

    id = db.Column(db.Integer, primary_key=True)
    author_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=False, index=True
    )
    content = db.Column(db.Text, nullable=False)
    is_pinned = db.Column(db.Boolean, nullable=False, default=False, index=True)

    author = db.relationship("User", foreign_keys=[author_id])
    likes = db.relationship(
        "FeedLike", back_populates="post", cascade="all, delete-orphan"
    )
    comments = db.relationship(
        "FeedComment", back_populates="post", cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<FeedPost id={self.id} author_id={self.author_id} pinned={self.is_pinned}>"


class FeedLike(db.Model):
    __tablename__ = "feed_likes"
    __table_args__ = (
        db.UniqueConstraint("post_id", "user_id", name="uq_feed_likes_post_user"),
    )

    id = db.Column(db.Integer, primary_key=True)
    post_id = db.Column(
        db.Integer, db.ForeignKey("feed_posts.id"), nullable=False, index=True
    )
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=False, index=True
    )
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    post = db.relationship("FeedPost", back_populates="likes")
    user = db.relationship("User", foreign_keys=[user_id])

    def __repr__(self):
        return f"<FeedLike id={self.id} post_id={self.post_id} user_id={self.user_id}>"


class FeedComment(db.Model):
    __tablename__ = "feed_comments"

    id = db.Column(db.Integer, primary_key=True)
    post_id = db.Column(
        db.Integer, db.ForeignKey("feed_posts.id"), nullable=False, index=True
    )
    author_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=False, index=True
    )
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    post = db.relationship("FeedPost", back_populates="comments")
    author = db.relationship("User", foreign_keys=[author_id])

    def __repr__(self):
        return (
            f"<FeedComment id={self.id} post_id={self.post_id} "
            f"author_id={self.author_id}>"
        )
