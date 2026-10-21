import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../app/AuthContext.jsx';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  Skeleton,
  Textarea,
} from '../../../components/ui';
import { Icon } from '../../../components/icons.jsx';
import { initials } from '../../../lib/format';
import {
  ACTIVITY_ICON_NAMES,
  createComment,
  createPost,
  deleteComment,
  deletePost,
  getActivity,
  getComments,
  getPosts,
  pinPost,
  timeAgo,
  toggleLike,
} from '../services';

/**
 * Trang Bảng tin nội bộ (route /feed) — mở rộng v4 mục 1.
 * - Mọi vai trò đã đăng nhập: đăng bài, thả tim, bình luận.
 * - HR/Admin: ghim/bỏ ghim bài, xoá bài/bình luận của người khác.
 * - Cột phải: hoạt động mới nhất toàn công ty + gợi ý tặng kudos.
 */

// Icon tim + ghim vẽ inline theo đúng chuẩn nét của bộ icons dùng chung
// (viewBox 24, stroke currentColor) vì bộ icon chung chưa có 2 glyph này.
function HeartIcon({ filled = false, size = 18 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M19.8 5.1a5 5 0 0 0-7.1 0l-.7.7-.7-.7a5 5 0 1 0-7.1 7.1l7.8 7.8 7.8-7.8a5 5 0 0 0 0-7.1Z" />
    </svg>
  );
}

function PinIcon({ size = 16 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M9 4h6l-1 7 3 3H7l3-7-1-7Z" />
      <path d="M12 14v7" />
    </svg>
  );
}

function friendlyError(err, fallback) {
  return err?.response?.data?.error?.message || err?.message || fallback;
}

function Avatar({ name, tone = 'brand' }) {
  const styles =
    tone === 'brand'
      ? 'bg-brand-50 text-brand-700'
      : 'bg-gray-100 text-gray-600 ring-1 ring-inset ring-gray-200';
  return (
    <span
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${styles}`}
      aria-hidden="true"
    >
      {initials(name || '?')}
    </span>
  );
}

/* ------------------------------ Bình luận ------------------------------ */

function CommentItem({ comment, onDelete, deleting }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600 ring-1 ring-inset ring-gray-200" aria-hidden="true">
        {initials(comment.author_name || '?')}
      </span>
      <div className="min-w-0 flex-1 rounded-lg bg-gray-50 px-3 py-2">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[13px] font-medium text-gray-900">{comment.author_name}</span>
          <span className="text-xs text-gray-400">{timeAgo(comment.created_at)}</span>
          {comment.can_delete ? (
            <button
              type="button"
              disabled={deleting}
              onClick={() => onDelete(comment)}
              className="ml-auto text-xs font-medium text-gray-400 transition-colors hover:text-red-600 disabled:opacity-50"
            >
              Xoá
            </button>
          ) : null}
        </div>
        <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
          {comment.content}
        </p>
      </div>
    </li>
  );
}

function CommentSection({ post, currentUser }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  const fullQuery = useQuery({
    queryKey: ['feed', 'comments', post.id],
    queryFn: () => getComments(post.id, { limit: 50 }),
    enabled: expanded,
    staleTime: 30_000,
  });

  const addMutation = useMutation({
    mutationFn: (content) => createComment(post.id, { content }),
    onSuccess: () => {
      setDraft('');
      setError('');
      queryClient.invalidateQueries({ queryKey: ['feed', 'comments', post.id] });
      queryClient.invalidateQueries({ queryKey: ['feed', 'posts'] });
    },
    onError: (err) => setError(friendlyError(err, 'Gửi bình luận thất bại, vui lòng thử lại.')),
  });

  const deleteMutation = useMutation({
    mutationFn: (comment) => deleteComment(comment.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feed', 'comments', post.id] });
      queryClient.invalidateQueries({ queryKey: ['feed', 'posts'] });
    },
  });

  const visibleComments = expanded
    ? fullQuery.data?.items || []
    : post.comments_preview || [];
  const hasMore = !expanded && (post.comment_count || 0) > visibleComments.length;

  function handleSubmit(e) {
    e.preventDefault();
    const content = draft.trim();
    if (!content || addMutation.isPending) return;
    addMutation.mutate(content);
  }

  return (
    <div className="border-t border-gray-100 px-5 py-3.5">
      {visibleComments.length > 0 ? (
        <ul className="space-y-3">
          {visibleComments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              deleting={deleteMutation.isPending}
              onDelete={(c) => {
                if (window.confirm('Xoá bình luận này?')) deleteMutation.mutate(c);
              }}
            />
          ))}
        </ul>
      ) : null}

      {expanded && fullQuery.isLoading ? (
        <div className="space-y-2" aria-hidden="true">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : null}

      {hasMore ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-3 text-[13px] font-medium text-brand-600 transition-colors hover:text-brand-700"
        >
          Xem tất cả {post.comment_count} bình luận
        </button>
      ) : null}

      {error ? (
        <Alert tone="error" className="mt-3">{error}</Alert>
      ) : null}

      <form onSubmit={handleSubmit} className="mt-3 flex items-start gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700" aria-hidden="true">
          {initials(currentUser?.fullName || '?')}
        </span>
        <div className="flex flex-1 items-center gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={1000}
            placeholder="Viết bình luận…"
            aria-label="Viết bình luận"
            className="h-9 flex-1 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-600/15"
          />
          <Button
            type="submit"
            variant="secondary"
            loading={addMutation.isPending}
            disabled={!draft.trim()}
            className="h-9 shrink-0"
          >
            Gửi
          </Button>
        </div>
      </form>
    </div>
  );
}

/* ------------------------------- Bài viết ------------------------------ */

function PostCard({ post, currentUser }) {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState('');

  const likeMutation = useMutation({
    mutationFn: () => toggleLike(post.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['feed', 'posts'] }),
  });

  const pinMutation = useMutation({
    mutationFn: () => pinPost(post.id, !post.is_pinned),
    onSuccess: () => {
      setActionError('');
      queryClient.invalidateQueries({ queryKey: ['feed', 'posts'] });
    },
    onError: (err) => setActionError(friendlyError(err, 'Thao tác ghim bài thất bại.')),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deletePost(post.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['feed', 'posts'] }),
    onError: (err) => setActionError(friendlyError(err, 'Xoá bài viết thất bại.')),
  });

  const meta = [
    post.author_department,
    post.author_code,
    timeAgo(post.created_at),
  ].filter(Boolean);

  return (
    <Card>
      <div className="flex items-start gap-3 px-5 pt-4">
        <Avatar name={post.author_name} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-gray-900">
              {post.author_name}
            </span>
            {post.is_pinned ? (
              <Badge tone="amber" dot>Đã ghim</Badge>
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-[13px] text-gray-500">
            {meta.join(' · ')}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {post.can_pin ? (
            <button
              type="button"
              disabled={pinMutation.isPending}
              onClick={() => pinMutation.mutate()}
              title={post.is_pinned ? 'Bỏ ghim bài viết' : 'Ghim bài viết lên đầu'}
              aria-label={post.is_pinned ? 'Bỏ ghim bài viết' : 'Ghim bài viết'}
              className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors disabled:opacity-50 ${
                post.is_pinned
                  ? 'bg-amber-50 text-amber-600 ring-1 ring-inset ring-amber-200'
                  : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'
              }`}
            >
              <PinIcon size={16} />
            </button>
          ) : null}
          {post.can_delete ? (
            <button
              type="button"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (window.confirm('Xoá bài viết này? Bình luận và lượt tim cũng sẽ bị xoá.')) {
                  deleteMutation.mutate();
                }
              }}
              title="Xoá bài viết"
              aria-label="Xoá bài viết"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
            >
              <Icon name="trash" size={16} />
            </button>
          ) : null}
        </div>
      </div>

      <p className="whitespace-pre-wrap px-5 pb-4 pt-3 text-[15px] leading-relaxed text-gray-800">
        {post.content}
      </p>

      {actionError ? (
        <div className="px-5 pb-3">
          <Alert tone="error">{actionError}</Alert>
        </div>
      ) : null}

      <div className="flex items-center gap-2 border-t border-gray-100 px-5 py-2.5">
        <button
          type="button"
          disabled={likeMutation.isPending}
          onClick={() => likeMutation.mutate()}
          aria-pressed={post.liked_by_me}
          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
            post.liked_by_me
              ? 'text-red-600 hover:bg-red-50'
              : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
          }`}
        >
          <HeartIcon filled={post.liked_by_me} size={18} />
          {post.like_count > 0 ? post.like_count : ''}
          <span>{post.liked_by_me ? 'Đã thích' : 'Thích'}</span>
        </button>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-gray-500">
          <Icon name="message" size={17} />
          {post.comment_count > 0 ? `${post.comment_count} bình luận` : 'Bình luận'}
        </span>
      </div>

      <CommentSection post={post} currentUser={currentUser} />
    </Card>
  );
}

/* ------------------------------- Cột phải ------------------------------- */

function ActivityCard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['feed', 'activity-latest'],
    queryFn: () => getActivity({ limit: 10 }),
    staleTime: 60_000,
    retry: 1,
  });
  const items = Array.isArray(data) ? data : [];

  return (
    <Card>
      <CardHeader title="Hoạt động mới nhất" subtitle="Diễn biến gần đây trên toàn công ty" />
      {isLoading ? (
        <div className="space-y-3 px-5 py-4" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      ) : isError || items.length === 0 ? (
        <CardBody>
          <p className="text-sm text-gray-500">Chưa có hoạt động nào gần đây.</p>
        </CardBody>
      ) : (
        <ul className="divide-y divide-gray-100">
          {items.map((item, idx) => (
            <li key={`${item.type}-${item.at || idx}-${idx}`}>
              <Link
                to={item.link || '/feed'}
                className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-gray-50"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-100">
                  <Icon name={ACTIVITY_ICON_NAMES[item.type] || 'bell'} size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] leading-snug text-gray-700">
                    {item.text}
                  </span>
                  <span className="mt-0.5 block text-xs text-gray-400">
                    {timeAgo(item.at)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* --------------------------------- Trang -------------------------------- */

export default function FeedPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const [postError, setPostError] = useState('');

  const postsQuery = useQuery({
    queryKey: ['feed', 'posts'],
    queryFn: () => getPosts({ page: 1, limit: 30 }),
    staleTime: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: (content) => createPost({ content }),
    onSuccess: () => {
      setDraft('');
      setPostError('');
      queryClient.invalidateQueries({ queryKey: ['feed', 'posts'] });
      queryClient.invalidateQueries({ queryKey: ['feed', 'activity-latest'] });
    },
    onError: (err) => setPostError(friendlyError(err, 'Đăng bài thất bại, vui lòng thử lại.')),
  });

  function handlePost(e) {
    e.preventDefault();
    const content = draft.trim();
    if (!content || createMutation.isPending) return;
    createMutation.mutate(content);
  }

  const posts = postsQuery.data?.items || [];

  return (
    <div className="page-shell">
      <PageHeader
        title="Bảng tin nội bộ"
        subtitle="Nơi chia sẻ tin tức, thành tích và câu chuyện đẹp của công ty — mọi người đều có thể đăng bài, thả tim và bình luận."
      />

      <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
        {/* Cột chính */}
        <div className="min-w-0 flex-1 space-y-5">
          <Card>
            <form onSubmit={handlePost} className="px-5 py-4">
              <div className="flex items-start gap-3">
                <Avatar name={user?.fullName} />
                <div className="min-w-0 flex-1">
                  <label className="sr-only" htmlFor="feed-new-post">Nội dung bài viết mới</label>
                  <Textarea
                    id="feed-new-post"
                    rows={3}
                    maxLength={2000}
                    placeholder={`Chia sẻ điều gì đó với công ty, ${user?.fullName || 'bạn'}…`}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    className="resize-none"
                  />
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="text-xs text-gray-400">
                      {draft.length}/2000 ký tự
                    </span>
                    <Button
                      type="submit"
                      variant="primary"
                      loading={createMutation.isPending}
                      disabled={!draft.trim()}
                    >
                      Đăng bài
                    </Button>
                  </div>
                  {postError ? (
                    <Alert tone="error" className="mt-3">{postError}</Alert>
                  ) : null}
                </div>
              </div>
            </form>
          </Card>

          {postsQuery.isLoading ? (
            <div className="space-y-5" aria-label="Đang tải bảng tin…">
              {[0, 1].map((i) => (
                <Card key={i}>
                  <div className="space-y-3 px-5 py-4" aria-hidden="true">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-5/6" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                </Card>
              ))}
            </div>
          ) : postsQuery.isError ? (
            <div>
              <Alert tone="error">Không tải được bảng tin. Vui lòng thử lại.</Alert>
              <Button
                variant="secondary"
                className="mt-3"
                onClick={() => postsQuery.refetch()}
              >
                Thử lại
              </Button>
            </div>
          ) : posts.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Icon name="chat" size={26} />}
                title="Bảng tin đang trống"
                description="Hãy là người đầu tiên chia sẻ một tin vui, một thành tích hay một lời cảm ơn với công ty."
              />
            </Card>
          ) : (
            posts.map((post) => (
              <PostCard key={post.id} post={post} currentUser={user} />
            ))
          )}
        </div>

        {/* Cột phải */}
        <aside className="w-full shrink-0 space-y-5 xl:w-[340px]" aria-label="Hoạt động và gợi ý">
          <ActivityCard />
          <Card>
            <CardHeader
              title="Ghi nhận đồng nghiệp"
              subtitle="Một lời khen đúng lúc tạo nên ngày làm việc đẹp hơn"
            />
            <CardBody>
              <p className="text-sm leading-relaxed text-gray-500">
                Đồng nghiệp vừa giúp đỡ bạn, hay một thành tích đáng nể vừa diễn ra?
                Hãy gửi kudos để ghi nhận và lan toả năng lượng tích cực.
              </p>
              <Link
                to="/kudos"
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 transition-colors hover:text-brand-700"
              >
                <Icon name="sparkles" size={16} />
                Tặng kudos ngay
              </Link>
            </CardBody>
          </Card>
        </aside>
      </div>
    </div>
  );
}
