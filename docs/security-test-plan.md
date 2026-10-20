# Kế hoạch kiểm thử bảo mật bằng Strix — Web HRM tích hợp AI

> Trạng thái: **KẾ HOẠCH** — tài liệu này không cài đặt và không chạy Strix.
> Mọi lệnh trong tài liệu là để tham khảo cho bước thực hiện sau, khi chủ sở
> hữu repo duyệt lại kế hoạch này.
> Tài liệu liên quan: checklist phòng thủ `docs/security.md` · phạm vi quét
> `security/strix-instructions.md` · kiến trúc bảo mật mục B8 `docs/architecture.md`.

## 1. Strix là gì

- **Strix** là công cụ **pentest bằng AI agent, mã nguồn mở** (giấy phép
  **Apache-2.0**): các agent tự hành xử như hacker — chạy thử ứng dụng thật,
  tìm lỗ hổng và **kiểm chứng bằng PoC thực tế** thay vì chỉ báo tĩnh (ít
  dương tính giả hơn quét tĩnh thuần túy).
- Repo dùng cho dự án này: **https://github.com/ryanowlops/strix** — bản
  **fork của `usestrix/strix`** (tại thời điểm đọc tài liệu, ngày 21/10/2026:
  nhánh `main`, commit `15c95718e600897a2a532a613a1c8fa6b712b144`, ~350 commit).
  Tài liệu đầy đủ của upstream ở `docs.strix.ai`.
- Bộ công cụ tích hợp của agent (theo README): HTTP proxy (thao tác
  request/response), tự động hóa trình duyệt (kiểm thử XSS/CSRF/luồng auth),
  terminal + Python runtime để viết/chạy khai thác kiểm chứng, trinh sát
  (recon) và phân tích mã nguồn; nhiều agent chuyên trách chạy song song.
- Nhóm lỗ hổng Strix tuyên bố phát hiện được và khớp bề mặt rủi ro của HRM:
  **access control (IDOR, leo thang quyền, bypass auth)**, injection
  (SQL/NoSQL/command), SSRF/XXE/deserialization, XSS, lỗi logic nghiệp vụ,
  **JWT/session**, và cấu hình hạ tầng sai.
- Các chế độ quét: white-box trên thư mục mã nguồn (`strix --target ./`),
  black-box trên URL (`strix --target <url>`), grey-box có đăng nhập, quét
  nhanh (`--scan-mode quick`) / chuẩn (`standard`), chạy không tương tác
  `-n` cho CI (thoát mã khác 0 khi có phát hiện), giới hạn phạm vi theo diff
  của PR (`--scope-mode diff`). Kết quả lưu ở `strix_runs/<tên-lần-chạy>`.

## 2. Điều kiện để chạy (chưa thực hiện trong dự án)

| Điều kiện | Chi tiết |
|---|---|
| Docker | Docker đang chạy trên máy — lần chạy đầu Strix tự kéo image sandbox về |
| LLM API key | Key của một nhà cung cấp LLM được hỗ trợ (OpenAI, Anthropic, Google...) — **chỉ khai báo qua biến môi trường, không ghi key thật vào bất kỳ file nào của repo** |
| Biến môi trường | `STRIX_LLM="<provider>/<model>"` (ví dụ placeholder `openai/<model>`), `LLM_API_KEY="<KEY CỦA BẠN — placeholder>"`; tùy chọn `LLM_API_BASE` nếu dùng model local (Ollama/LMStudio), `STRIX_REASONING_EFFORT` |
| Lưu ý cấu hình | Strix lưu cấu hình vào `~/.strix/cli-config.json` trên máy — coi file này là **nhạy cảm** (có thể chứa thông tin cấu hình/key), không chia sẻ, không commit |
| Dữ liệu quét | Chỉ môi trường local + dữ liệu seed giả lập (mục 5) |

## 3. Cảnh báo phạm vi: chỉ quét hệ thống của chính mình

- README của Strix tự ghi rõ: *"Only test apps you own or have permission
  to test. You are responsible for using Strix ethically and legally."*
- Dự án HRM này là **hệ thống của chính chủ sở hữu repo**, và chủ sở hữu đã
  cho phép quét **để phòng thủ** (tìm lỗ hổng trong đồ án của mình trước khi
  demo). Đó là căn cứ ủy quyền duy nhất và là đủ cho phạm vi ở
  `security/strix-instructions.md`.
- **Không** dùng Strix (hay bất kỳ công cụ tấn công nào) trỏ vào hệ thống
  của trường, công ty, website công khai hay bất kỳ hệ thống nào không thuộc
  sở hữu/không có giấy phép kiểm thử bằng văn bản. Quét trái phép hệ thống
  của người khác là vi phạm pháp luật, kể cả "chỉ quét thử".
- Agent AI có tính tự chủ: nó có thể thử các hướng ngoài dự kiến. Vì vậy
  phạm vi phải khóa cứng bằng instruction file (mục 5) và bằng môi trường
  chạy (chỉ localhost, mạng local tách biệt) — không dựa vào việc "agent sẽ
  tự biết dừng".

## 4. Vì sao KHÔNG chạy `curl | bash` một cách mù quáng

README của Strix hướng dẫn cài bằng `curl -sSL https://strix.ai/install | bash`.
Với dự án này, **không làm theo một cách máy móc**, vì:

1. `curl | bash` là **thực thi mã từ xa bằng quyền của người dùng** ngay khi
   tải — nội dung script ở đầu xa thay đổi lúc nào thì máy nhận đúng nội
   dung lúc đó; không có bước xem xét, không ghim phiên bản, không kiểm tra
   checksum trong quy trình mặc định.
2. Repo dùng ở đây là **fork**: phải đối chiếu fork có lệch upstream ở những
   file nhạy cảm (script cài đặt, mã agent) hay không, thay vì tin mặc định.
3. Lỗi hoặc hành vi ngoài ý muốn của script cài đặt (ghi file hệ thống, cài
   gói toàn cục...) khó khôi phục hơn nhiều so với cài trong môi trường cô lập.

**Cách làm an toàn đã chốt cho dự án (khi thực hiện ở bước sau):**

- Tải script cài đặt về **file riêng và đọc toàn bộ nội dung trước**; chỉ
  chạy khi đã hiểu script tải gì, cài vào đâu, có sửa cấu hình hệ thống không.
- Ưu tiên cài/chạy trong **môi trường cô lập** (máy ảo/container riêng, tài
  khoản người dùng phụ) và ghim vào **commit/phiên bản cụ thể** của fork đã
  đối chiếu với upstream `usestrix/strix`.
- Sau cài đặt, kiểm tra binary/gói đã cài khớp nguồn đã đọc; ghi lại phiên
  bản đã dùng vào báo cáo quét để lần quét lại dùng đúng phiên bản đó.

## 5. Kế hoạch quét (thực hiện ở bước sau, theo thứ tự)

**Bước 0 — Chuẩn bị.** Đọc script cài đặt theo mục 4; cài Strix trong môi
trường cô lập; chuẩn bị LLM API key dạng biến môi trường (key riêng cho việc
quét, đặt hạn mức chi phí ở phía nhà cung cấp, thu hồi sau khi quét xong).

**Bước 1 — Dựng mục tiêu local.** Chạy app bằng `docker compose up` theo
kiến trúc B7, seed **dữ liệu giả lập** (nhân viên/phòng ban/CV mẫu hư cấu),
tạo sẵn các tài khoản kiểm thử đủ 4 vai trò. Kiểm tra app khỏe
(`GET /api/v1/health`) và chạy qua checklist `docs/security.md` mục 10 bằng
tay/test tự động trước — Strix là lớp kiểm chứng bổ sung, không thay thế
test phân quyền của chính nhóm.

**Bước 2 — Quét white-box mã nguồn.** Quét thư mục dự án ở chế độ chuẩn,
kèm instruction file của dự án. Lệnh tham khảo (chưa chạy):

```bash
strix --target ./ --scan-mode standard --instruction-file ./security/strix-instructions.md
```

**Bước 3 — Quét black-box bản local.** Trỏ vào ứng dụng đang chạy local —
**chỉ localhost**, đúng phạm vi `security/strix-instructions.md`:

```bash
strix --target http://localhost:5000 --instruction-file ./security/strix-instructions.md
```

**Bước 4 — Đọc và phân loại báo cáo.** Đọc kết quả trong `strix_runs/…`,
đối chiếu từng phát hiện với code thật (agent có thể báo sai ngữ cảnh dù đã
có PoC). Phân loại Critical / High / Medium / Low; phát hiện nào không tái
hiện được bằng tay thì hạ mức và ghi rõ "chưa kiểm chứng".

**Bước 5 — Vá theo mức độ.** Vá Critical/High trước (thường gặp nhất ở HRM:
IDOR/phân quyền theo dữ liệu, JWT, upload — ánh xạ thẳng tới mục 3, 1, 4
của `docs/security.md`). Mỗi lỗ hổng đã vá phải có **test tái hiện** trong
bộ test phân quyền (mục 10 của `docs/security.md`) để không tái phát.

**Bước 6 — Quét lại để xác nhận.** Quét lại phạm vi đã vá (chế độ quick/diff
là đủ), xác nhận phát hiện cũ không còn và không phát sinh lỗi mới. Chỉ khi
Critical/High = 0 mới coi như đạt cổng bảo mật cho bản demo.

**Bước 7 — Lưu trữ kết quả.** Báo cáo quét và PoC có thể chứa thông tin nhạy
cảm (đường dẫn, payload, dữ liệu seed): lưu cục bộ, **rà soát và loại bỏ bí
mật trước khi đưa bất cứ phần nào lên repo**, không commit nguyên thư mục
`strix_runs/` lên repo công khai.

## 6. Mẫu GitHub Actions workflow (CHỈ LÀ TÀI LIỆU THAM KHẢO)

> Mẫu dưới đây phỏng theo ví dụ CI/CD trong README của upstream Strix.
> **Chưa tạo file workflow thật trong repo** — chỉ bật sau khi đã quét local
> ổn định, vì mỗi lần chạy CI đều tốn chi phí LLM và cần secret hợp lệ.

```yaml
# MẪU TÀI LIỆU — không phải workflow đang hoạt động
name: strix-penetration-test

on:
  pull_request:

jobs:
  security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0        # Strix cần đủ lịch sử để tự giới hạn phạm vi diff của PR

      - name: Install Strix
        # LƯU Ý: bước này dùng chính lệnh curl|bash mà mục 4 yêu cầu phải
        # đọc/ghim phiên bản trước khi áp dụng thật.
        run: curl -sSL https://strix.ai/install | bash

      - name: Run Strix
        env:
          STRIX_LLM: ${{ secrets.STRIX_LLM }}       # khai báo trong GitHub Secrets
          LLM_API_KEY: ${{ secrets.LLM_API_KEY }}   # KHÔNG ghi key thật vào file này
        run: strix -n -t ./ --scan-mode quick       # -n: không tương tác, có phát hiện -> exit != 0 -> PR bị chặn
```

Ghi chú khi cân nhắc áp dụng thật:

- Secret chỉ đặt trong **GitHub Secrets**, không đặt trong file workflow,
  không dùng key LLM cá nhân không đặt hạn mức (mỗi PR là một lần quét tốn phí).
- Quét trên PR của fork lạ có thể bị lạm dụng để đốt quota — cân nhắc giới
  hạn `on: pull_request` chỉ cho nhánh nội bộ, hoặc chạy thủ công
  (`workflow_dispatch`) thay vì tự động.
- Kết quả quét trên CI chỉ là cảnh báo hỗ trợ; cổng chặn merge cuối cùng vẫn
  là review của người + bộ test phân quyền tự động của dự án.

## 7. Rủi ro khi dùng Strix và biện pháp kiểm soát

| Rủi ro | Kiểm soát trong kế hoạch này |
|---|---|
| Agent tự chủ hành động ngoài phạm vi (trỏ ra dịch vụ ngoài, leo thang kiểm thử) | Instruction file khóa phạm vi localhost/repo (mục 3); chạy app trong mạng local cô lập; không cấp cho agent bất kỳ thông tin đăng nhập/dịch vụ ngoài nào |
| PoC khai thác làm hỏng dữ liệu local (xóa/sửa bản ghi khi kiểm chứng) | Chỉ quét bản local bằng Docker Compose với dữ liệu seed giả, khôi phục bằng cách dựng lại compose; tuyệt đối không quét bản có dữ liệu thật |
| Chi phí LLM phát sinh ngoài dự kiến (agent chạy dài, nhiều vòng lặp) | Key riêng cho việc quét + đặt hạn mức ở nhà cung cấp; bắt đầu bằng `--scan-mode quick`; theo dõi `strix_runs` và usage sau mỗi lần chạy |
| Rò rỉ bí mật qua cấu hình/báo cáo (`~/.strix/cli-config.json`, `strix_runs/`, PoC chứa token/dữ liệu) | Coi hai vị trí này là nhạy cảm; rà soát trước khi chia sẻ; không commit lên repo công khai |
| Tin tưởng nhầm vào kết quả (báo thiếu → tưởng an toàn; báo thừa → mất thời gian) | Mọi phát hiện phải tái hiện bằng tay mới tính là thật; "Strix không tìm thấy" không đồng nghĩa hệ thống an toàn — checklist `docs/security.md` và test phân quyền vẫn là chuẩn nghiệm thu chính |
| Rủi ro chuỗi cung ứng từ cài đặt (script từ xa, fork lệch upstream) | Quy trình mục 4: đọc script trước, ghim phiên bản, đối chiếu fork với upstream, cài trong môi trường cô lập |
| Vấn đề pháp lý/đạo đức nếu đổi mục tiêu quét | Chỉ quét hệ thống của chính chủ sở hữu đã cho phép (mục 3); mọi mục tiêu khác đều ngoài phạm vi, kể cả khi "chỉ xem thử" |
