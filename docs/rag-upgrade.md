# Nâng cấp RAG cho Chatbot HR — Embedding thật + Hybrid Search + Rerank

Tài liệu này mô tả pipeline RAG sau nâng cấp (thay cho cơ chế "tìm theo
embedding nếu có, không thì từ khoá" ở bản đầu — xem `docs/architecture.md`
mục A6.2 cho bối cảnh gốc). Nguyên tắc giữ nguyên: **chatbot chỉ trả lời
dựa trên tài liệu quy chế do HR nạp; không đủ thông tin thì từ chối rõ
ràng, không bịa chính sách.**

## 1. Kiến trúc pipeline

### 1.1. Lập chỉ mục (indexing) — `server/app/blueprints/kb/services.py`

```
Upload PDF/TXT (HR/Admin)
  → trích text theo trang (pypdf / UTF-8)
  → chia chunk 500–1000 ký tự, overlap 100, ưu tiên cắt ở ranh giới câu/đoạn,
    ghi kèm số trang (page_no)
  → tạo embedding THEO BATCH cho mọi chunk trong 1 lần gọi provider
    (nội dung đem embed = tiêu đề tài liệu + "\n" + nội dung chunk;
     chunk_text lưu DB giữ nguyên bản để hiển thị/trích dẫn)
  → lưu KbDocument (status=ready) + KbChunk (embedding là cột JSON list[float])
```

- Lỗi embedding (chưa có key, provider lỗi...) **không làm hỏng việc nạp
  tài liệu**: chunk đó lưu `embedding = None` và chatbot tự hạ cấp.
- **Lập chỉ mục lại** — `POST /api/v1/kb/documents/<id>/reindex` (HR/Admin):
  hệ thống có giữ file gốc trên server (`KbDocument.file_url`, thư mục
  `uploads/kb/`) nên reindex đọc lại file gốc → trích/chunk/embed lại từ
  đầu, thay toàn bộ chunk cũ. Nếu file gốc không còn, reindex lùi về chỉ
  bổ sung embedding cho các chunk đang thiếu (nội dung cũ giữ nguyên).
- **Bổ sung embedding toàn KB** — `POST /api/v1/kb/embed-missing`
  (HR/Admin): tạo embedding cho mọi chunk chưa có, trả
  `{total, embedded, failed}`. Dùng khi server vừa được cấu hình
  `AI_API_KEY`/đổi model embedding mà không muốn nạp lại tài liệu.
  Cả hai thao tác đều có nút tương ứng trong panel "Tài liệu quy chế
  (KB)" ở trang Chatbot HR.

### 1.2. Truy hồi (retrieval) — `server/app/blueprints/chat/services.py`

```
Câu hỏi
  → Phía VECTOR: embed câu hỏi → cosine với mọi chunk có embedding → top 20
  → Phía TỪ KHOÁ: số từ khoá chung (đã bỏ stopword tiếng Việt) → top 20
  → Cổng liên quan: ít nhất 1 phía phải đủ mạnh
      (vector: cosine cao nhất ≥ CHAT_MIN_SIMILARITY, mặc định 0.30;
       từ khoá: khớp ≥ 2 từ, hoặc ≥ 1 nếu câu hỏi ≤ 3 từ)
    — không phía nào đạt → trả câu từ chối mẫu, KHÔNG gọi AI
  → Điểm lai: chuẩn hoá min-max từng phía → 0.7·vector + 0.3·từ khoá
    (chunk chỉ có ở 1 phía thì phía còn lại tính 0)
  → RERANK bằng LLM (nếu provider khả dụng): LLM nhận câu hỏi + danh sách
    ứng viên (trích đoạn tối đa 300 ký tự) và trả JSON thứ tự liên quan
    giảm dần; parse an toàn — lỗi/sai định dạng thì giữ thứ tự điểm lai
  → Lấy TOP_K = 5 đoạn → sinh câu trả lời (AI diễn giải + trích dẫn
    [Tên tài liệu, trang X]; AI không khả dụng → trích đoạn nguyên văn)
  → Lưu ChatLog; response trả kèm "mode" và mỗi nguồn có thêm "score"
```

## 2. Cấu hình

| Biến môi trường | Mặc định | Ý nghĩa |
|---|---|---|
| `AI_API_KEY` | _(trống)_ | Khoá API — không có key thì không tạo được embedding/chat, hệ thống tự hạ cấp (mục 3) |
| `AI_PROVIDER` / `AI_BASE_URL` | `openai` / `https://api.openai.com/v1` | Provider tương thích OpenAI (DeepSeek, Qwen, vLLM local...) |
| `AI_MODEL` | `gpt-4o-mini` | Model chat (trả lời + rerank) |
| `AI_EMBEDDING_MODEL` | `text-embedding-3-small` | Model embedding, gọi qua `POST {base}/embeddings` (hỗ trợ input 1 chuỗi hoặc batch list chuỗi) |
| `CHAT_MIN_SIMILARITY` | `0.30` | Ngưỡng cosine tối thiểu của phía vector ở cổng liên quan |

Tầng AI vẫn provider-agnostic: mọi lời gọi đi qua
`server/app/ai_service` (HTTP JSON thuần bằng `urllib`, không SDK).
`app.ai_service.embed_text(text)` / `embed_texts(texts)` là hàm chuẩn mà
tầng KB tự dò tìm — khi provider chưa sẵn sàng, hai hàm này raise
`AIUnavailableError` và tầng KB/chat tự bắt để hạ cấp.

## 3. Các chế độ truy hồi và cách tự hạ cấp

Response của `POST /api/v1/chat/ask` trả thêm trường `mode`; frontend
hiển thị nhãn nhỏ dưới câu trả lời (ví dụ "Truy hồi: Lai + xếp hạng lại"):

| Mode | Khi nào | Điều kiện |
|---|---|---|
| `hybrid_rerank` | Cả vector + từ khoá có ứng viên, LLM rerank thành công | Có `AI_API_KEY`, chunk đã có embedding |
| `hybrid` | Cả hai phía có ứng viên, rerank không chạy được/không cần | Có embedding; LLM lỗi hoặc chỉ có 1 ứng viên |
| `embedding` | Chỉ phía vector có ứng viên | Có embedding; từ khoá không khớp đoạn nào |
| `keyword` | Không tạo được embedding cho câu hỏi | Chưa có key / provider embedding lỗi / chunk chưa có vector — **hành vi như bản cũ** |
| `none` | Không đủ liên quan ở cả hai phía | Trả câu từ chối mẫu, không gọi AI, không bịa |

Hạ cấp theo tầng: mất embedding → còn từ khoá; mất LLM → còn trích đoạn
nguyên văn kèm nguồn; mất cả hai → vẫn tra cứu từ khoá + trích đoạn được.
Không trạng thái nào làm hỏng chức năng HRM lõi.

## 4. Cách kiểm thử

Đã kiểm chứng tự động bằng script tạm (ngoài repo) với Flask test client
+ DB SQLite tạm, **monkeypatch `app.ai_service`** bằng provider giả lập
(embedding tất định theo túi từ băm + ánh xạ đồng nghĩa bệnh→ốm; chat giả
lập cho cả rerank và trả lời):

1. Nạp tài liệu quy chế 3 điều khoản (phép năm / ốm đau / thử việc) →
   tài liệu `ready`, 3 chunk, mọi chunk có embedding dạng `list[float]`.
2. Hỏi bằng diễn đạt khác từ khoá gốc ("Khi **bị bệnh**…" trong khi tài
   liệu viết "**ốm đau**") → chunk đúng (điều ốm đau) đứng đầu,
   `mode = hybrid_rerank`, sources có `score`, câu trả lời đúng nội dung.
3. Hỏi ngoài tài liệu → sources rỗng, câu từ chối mẫu, `mode = none`.
4. Xoá embedding của mọi chunk → `POST /kb/embed-missing` bổ sung đủ lại.
5. `POST /kb/documents/<id>/reindex` → `rebuilt = true`, embed đủ chunk.
6. Tắt embedding giả lập (raise `AIUnavailableError`) → hỏi lại,
   `mode = keyword` và vẫn có sources/câu trả lời.

Kết quả: 18/18 kiểm tra ở tầng service + 6/6 ở tầng HTTP đều đạt.
Khi kiểm thử thủ công với key thật: đặt `AI_API_KEY` (+ tuỳ chọn
`AI_EMBEDDING_MODEL`) trong `server/.env`, khởi động lại server, nạp 1
tài liệu quy chế ở trang Chatbot HR rồi hỏi — nhãn dưới câu trả lời sẽ
hiện chế độ `hybrid_rerank`.

## 5. Giới hạn và hướng mở rộng

- **Cosine tính trong Python**: mỗi câu hỏi duyệt toàn bộ chunk và tính
  cosine bằng vòng lặp thuần — phù hợp quy mô đồ án (vài tài liệu quy
  chế, hàng trăm–nghìn chunk, độ trễ không đáng kể). Khi KB lớn lên
  (hàng chục nghìn chunk), chuyển cột `KbChunk.embedding` sang
  **pgvector** (`Vector(1536)` + index HNSW/IVFFlat trên PostgreSQL) và
  để DB truy hồi top-k vector; pipeline hybrid/rerank giữ nguyên, chỉ
  thay lớp lưu trữ/truy vấn (đã ghi chú sẵn trong `app/models/kb.py`).
- Điểm từ khoá là đếm từ chung đơn giản (chưa có BM25/TF-IDF) — đủ làm
  phía phụ cho hybrid; nâng lên BM25 khi cần độ chính xác cao hơn.
- Rerank tốn thêm 1 lần gọi LLM cho mỗi câu hỏi có ngữ cảnh; đổi lại
  thứ tự ngữ cảnh chính xác hơn. Có thể tắt hiệu quả bằng cách dùng
  provider không khả dụng cho chat — khi đó hệ thống vẫn chạy hybrid.
- Embedding tạo theo batch lúc nạp tài liệu vẫn chạy đồng bộ trong
  request (giới hạn đồ án như pipeline gốc); production nên đẩy sang
  worker nền.
