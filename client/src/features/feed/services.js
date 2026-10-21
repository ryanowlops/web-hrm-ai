// Service layer cho module Bảng tin nội bộ (Feed).
// File này ở client/src/features/feed/ nên api ở ../../api/axiosClient.
// API: /api/v1/feed (posts, like toggle, pin, comments, activity).
import axiosClient from '../../api/axiosClient';

// axiosClient trả về body đã unwrap sẵn (response.data) qua interceptor.
function unwrapMember(body) {
  if (body && typeof body === 'object' && !Array.isArray(body) && 'data' in body && body.data && typeof body.data === 'object') {
    return body.data;
  }
  return body;
}

function unwrapList(body) {
  if (Array.isArray(body)) return { items: body, meta: null };
  return { items: body?.data ?? [], meta: body?.meta ?? null };
}

export async function getPosts(params = {}) {
  const res = await axiosClient.get('/feed/posts', { params });
  return unwrapList(res);
}

export async function createPost(payload) {
  const res = await axiosClient.post('/feed/posts', payload);
  return unwrapMember(res);
}

export async function deletePost(id) {
  const res = await axiosClient.delete(`/feed/posts/${id}`);
  return res;
}

export async function pinPost(id, isPinned) {
  const res = await axiosClient.post(`/feed/posts/${id}/pin`, { is_pinned: isPinned });
  return unwrapMember(res);
}

export async function toggleLike(id) {
  const res = await axiosClient.post(`/feed/posts/${id}/like`);
  return unwrapMember(res);
}

export async function getComments(postId, params = {}) {
  const res = await axiosClient.get(`/feed/posts/${postId}/comments`, { params });
  return unwrapList(res);
}

export async function createComment(postId, payload) {
  const res = await axiosClient.post(`/feed/posts/${postId}/comments`, payload);
  return unwrapMember(res);
}

export async function deleteComment(id) {
  const res = await axiosClient.delete(`/feed/comments/${id}`);
  return res;
}

export async function getActivity(params = {}) {
  const res = await axiosClient.get('/feed/activity', { params });
  const body = unwrapMember(res);
  return Array.isArray(body) ? body : body?.items ?? [];
}

/** Thời gian tương đối kiểu "5 phút trước" / "2 giờ trước" / "3 ngày trước". */
export function timeAgo(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'Vừa xong';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ngày trước`;
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Icon (tên trong bộ icons dùng chung) theo loại sự kiện của dòng hoạt động. */
export const ACTIVITY_ICON_NAMES = {
  kudo: 'sparkles',
  announcement: 'bell',
  new_employee: 'users',
  attendance: 'clock',
  post: 'chat',
};
