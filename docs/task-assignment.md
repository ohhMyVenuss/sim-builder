# Kế hoạch phân công & Tiêu chuẩn nghiệm thu hoàn thiện dự án

Tài liệu này phân công 4 hạng mục nâng cấp trọng tâm cho **2 thành viên** để đưa dự án đạt chuẩn ứng dụng thực tế tại Việt Nam, đồng thời quy định rõ **tiêu chuẩn kiểm thử (Definition of Done)** cho từng hạng mục.

---

## Quy chuẩn chung bắt buộc (Áp dụng cho cả 2 thành viên)

1. **Hệ thống Icon & UI**:
   - **Không sử dụng emoji hệ thống** (`📐`, `🏗️`, `🪑`, `📊`, `⚠️`, `🔍`...) trong giao diện UI, nút bấm, tiêu đề, thông báo hay danh mục sản phẩm.
   - Ưu tiên sử dụng bộ icon SVG đồng nhất từ thư viện (cài đặt `lucide-react` hoặc mở rộng bộ SVG icon chuẩn tại `components/room-organizer/plotcraft/icon.tsx`) với kích thước, độ dày nét (`strokeWidth`) và màu sắc nhất quán.
2. **Tối ưu hóa cho Tiếng Việt**:
   - Toàn bộ nhãn, tooltip, thông báo lỗi, modal xác nhận và tài liệu xuất ra sử dụng **tiếng Việt chuẩn, ngắn gọn, tự nhiên** (tránh dịch word-by-word hoặc pha trộn Anh–Việt).
   - Font chữ hiển thị hỗ trợ đầy đủ dấu tiếng Việt (tránh lỗi rớt dấu hoặc sai kerning ở tiêu đề in hoa); định dạng số, diện tích (`m²`), chiều dài (`m`) và tiền tệ (`₫` / `tr ₫`) theo chuẩn `vi-VN`.
3. **Chất lượng mã nguồn (CI Gate)**:
   - `npm run typecheck` không lỗi.
   - `npm run lint` (hoặc `npx eslint --max-warnings=0`) đạt **0 lỗi, 0 cảnh báo**.
   - Cập nhật `docs/architecture.md` mỗi khi thêm file mới dưới `components/room-organizer/` để `lib/docs-drift.test.ts` pass.
   - Toàn bộ logic thuần (parser, toán học hình học, tính toán BOQ) đặt trong `components/room-organizer/lib/` và có unit test Vitest đi kèm.

---

## Phân công 1: Hoài Vũ — Nhiệm vụ 1 & Nhiệm vụ 2

### Nhiệm vụ 1: Nâng cấp bộ chuyển đổi Bản vẽ kỹ thuật 2D → 3D sát thực tế
**Phạm vi file chính**: `lib/blueprint-2d-to-3d.ts`, `panels/blueprint-2d-panel.tsx`, `hooks/layout-reducer.ts`.

#### Công việc cần làm
1. **Chọn vùng mặt bằng (ROI Crop) trước khi phân tích ảnh**:
   - Cho phép người dùng kéo khung chọn trực tiếp vùng mặt bằng chính trên ảnh tải lên để loại bỏ khung tên (title block), bảng ghi chú và các đường gióng kích thước bên ngoài.
2. **Hiệu chỉnh tỷ lệ bằng 2 điểm (2-Point Calibration)**:
   - Bổ sung chế độ click chọn 2 điểm bất kỳ trên ảnh bản vẽ rồi nhập khoảng cách thực tế (mét, ví dụ `7.844 m`) để tính chính xác hệ số quy đổi pixel → mét.
3. **Nhận diện tường chéo, cửa đi & cửa sổ**:
   - Với **ảnh raster**: bổ sung thuật toán phát hiện đoạn thẳng góc bất kỳ (Hough Transform / LSD) cho tường chéo và nhận diện ký hiệu cung tròn mở cửa để tự động sinh `door` / `window`.
   - Với **file `.dxf`**: đọc thêm thông tin `LAYER` (như `WALL`, `DOOR`, `WINDOW`) để phân loại tường và tự động đặt cửa đục lỗ tương ứng.
4. **Hỗ trợ nhập trực tiếp file PDF bản vẽ (`.pdf`)**:
   - Tích hợp `pdfjs-dist` (render trang PDF ra `Canvas2D` phía client) để người dùng tải lên thẳng hồ sơ thiết kế PDF.

#### Chuẩn kiểm thử hoàn thành (Acceptance Criteria)
- [ ] **ROI Crop**: Tải ảnh bản vẽ có khung tên bên phải và đường kích thước xung quanh → sau khi khoanh vùng mặt bằng, khung tên không bị nhận nhầm thành tường 3D.
- [ ] **2-Point Calibration**: Click 2 điểm trên cạnh dài `7.844 m` và nhập `7.844` → kích thước phòng 3D sinh ra sai số dưới `±0.05 m`.
- [ ] **DXF & PDF**: Import thành công tối thiểu 1 file `.pdf` (1 trang mặt bằng) và 1 file `.dxf` có layer tường/cửa → mô hình 3D tự dựng tường và đục lỗ cửa đúng vị trí.
- [ ] **Unit Test**: Bổ sung test case trong `lib/blueprint-2d-to-3d.test.ts` cho hàm crop ROI, tính scale từ 2 điểm và phân tách layer DXF; toàn bộ test pass 100%.

---

### Nhiệm vụ 2: Mở rộng Dự toán từ "Nội thất" thành "Bảng dự toán hoàn thiện (BOQ)"
**Phạm vi file chính**: `lib/budget.ts`, `lib/constants.ts`, `lib/file-io.ts`, `panels/statistics-panel.tsx`, `panels/furniture-catalog-panel.tsx`.

#### Công việc cần làm
1. **Tính chi phí vật liệu hoàn thiện theo diện tích (`m²`)**:
   - Dựa trên kết quả nhận diện phòng (`lib/room-detect.ts`) và kích thước tường/lỗ cửa (`three/wall-openings.ts`), tính tự động:
     - **Diện tích sàn (`m²`)** × đơn giá vật liệu lát sàn (gạch men / sàn gỗ / bê tông mài).
     - **Diện tích tường thực (`m²`, đã trừ diện tích cửa đi/cửa sổ)** × đơn giá sơn nước / ốp gạch / giấy dán tường.
2. **Phân khúc ngân sách & Tùy chỉnh đơn giá**:
   - Cho phép chọn nhanh 3 gói mức giá bình quân thị trường Việt Nam (**Tiết kiệm – Phổ thông – Cao cấp**) hoặc chỉnh sửa trực tiếp đơn giá VNĐ của từng món/hạng mục trong dự toán.
3. **Xuất Bảng dự toán (BOQ) chi tiết**:
   - Bổ sung chức năng xuất bảng dự toán theo từng phòng/tầng ra file `.csv` (hỗ trợ UTF-8 BOM mở chuẩn trên Excel tiếng Việt) hoặc bản in `.pdf` gồm: STT, Hạng mục, Phòng, Số lượng, Đơn vị (`cái`, `m²`), Đơn giá (VNĐ), Thành tiền (VNĐ).

#### Chuẩn kiểm thử hoàn thành (Acceptance Criteria)
- [ ] **Độ chính xác diện tích & tiền**: Với phòng `5 m × 4 m` cao `3 m` có 1 cửa `0.9 m × 2.05 m`, diện tích sàn tính đúng `20 m²` và diện tích tường tính đúng đã trừ lỗ cửa; tổng chi phí BOQ = Chi phí nội thất + Chi phí hoàn thiện sàn/tường.
- [ ] **Tùy chỉnh & Gói giá**: Đổi gói giá hoặc sửa đơn giá 1 món đồ → tổng dự toán và thanh tiến độ ngân quỹ (`header-stats.tsx`, `statistics-panel.tsx`) cập nhật tức thì bằng VNĐ.
- [ ] **Xuất file BOQ**: File `.csv` xuất ra mở bằng Excel hiển thị đúng tiếng Việt có dấu, không lỗi font, công thức tổng khớp với giao diện.
- [ ] **Unit Test**: Bổ sung test trong `lib/budget.test.ts` cho công thức tính vật liệu theo `m²` và gói phân khúc giá; tất cả test pass.

---

## Phân công 2: Nhật Minh — Nhiệm vụ 3 & Nhiệm vụ 4

### Nhiệm vụ 3: Linh hoạt kiến trúc theo nhà ở Việt Nam
**Phạm vi file chính**: `lib/types.ts`, `lib/footprint.ts`, `lib/constants.ts`, `three/room-builder.ts`, `three/interior-walls.ts`, `panels/templates-panel.tsx`.

#### Công việc cần làm
1. **Hỗ trợ mặt bằng đa giác tự do (Polygon Footprint)**:
   - Mở rộng cấu trúc dữ liệu từ hình chữ nhật / chữ L (`FootprintCutout`) sang hỗ trợ danh sách đỉnh đa giác `outline: Vec2[]` để dựng được nhà đất méo, nhà nở hậu, hoặc căn hộ nhiều góc thụt (logia, hộp kỹ thuật).
   - Cập nhật đồng bộ logic kiểm tra biên (`isInsideBuilding`, `clampToBuilding`), sàn/mái 3D và bản vẽ 2D.
2. **Phân biệt độ dày tường (100 mm vs 200 mm)**:
   - Cho phép gán độ dày riêng cho tường bao chịu lực (`0.2 m`) và vách ngăn phòng (`0.1 m`), hiển thị đúng tỷ lệ trên cả mặt bằng 2D và khối 3D.
3. **Thư viện mẫu nhà Việt Nam (Templates)**:
   - Tạo bộ template kiến trúc thực tế tại Việt Nam trong `constants.ts`:
     - Nhà ống `5 m × 15 m` (2 tầng)
     - Nhà phố `5 m × 20 m` (3 tầng)
     - Căn hộ chung cư 2 phòng ngủ (`70 m²`) và 3 phòng ngủ (`95 m²`).

#### Chuẩn kiểm thử hoàn thành (Acceptance Criteria)
- [ ] **Đa giác & Va chạm**: Dựng được mặt bằng đa giác 6+ đỉnh (ví dụ đất nở hậu hoặc căn hộ có logia); đồ nội thất bị chặn không cho đặt ra ngoài biên đa giác và tường bao khép kín không hở khe trong 3D.
- [ ] **Độ dày tường**: Đổi độ dày vách ngăn giữa `0.1 m` và `0.2 m` → độ dày hiển thị trên 2D và 3D thay đổi tương ứng, cửa đi/cửa sổ vẫn đục lỗ xuyên tường không bị che mặt.
- [ ] **Templates Việt Nam**: Chọn từng mẫu nhà Việt Nam trong bảng Templates → load đủ tầng, vách ngăn, cửa và nội thất cơ bản không có lỗi va chạm (`collidingIds.size === 0`).
- [ ] **Unit Test**: Thêm test kiểm tra `isInsideBuilding` / `clampToBuilding` với đa giác bất kỳ và kiểm tra schema các template mới không vi phạm `schema.test.ts`.

---

### Nhiệm vụ 4: Đồng bộ Tiếng Việt, Chuẩn hóa Icon thư viện & Tối ưu UX
**Phạm vi file chính**: Toàn bộ `components/room-organizer/panels/*`, `plotcraft/icon.tsx`, `lib/constants.ts`, `lib/collision-reason.ts`, `lib/editor-notices.ts`.

#### Công việc cần làm
1. **Thay thế toàn bộ emoji hệ thống bằng Icon từ thư viện**:
   - Rà soát và xóa sạch các emoji dùng làm icon trong `CATEGORIES`, `FURNITURE_CATALOG`, các nút công cụ, tiêu đề panel, thông báo toast và nhãn chế độ (`🪑`, `🛋️`, `📐`, `📊`, `🔍`, `⚠️`, `🏗️`...).
   - Thay thế bằng icon SVG vector đồng bộ từ `lucide-react` (hoặc mở rộng `plotcraft/icon.tsx`) theo từng nhóm: nội thất, cấu trúc, công cụ vẽ, cảnh báo, tài chính.
2. **Tối ưu hóa toàn bộ giao diện cho ngôn ngữ Tiếng Việt**:
   - Xây dựng từ điển/cấu trúc i18n gọn nhẹ (`lib/i18n.ts`) hỗ trợ chuyển đổi **Tiếng Việt (mặc định)** / Tiếng Anh, đảm bảo 100% UI (menu, sidebar, nút bấm, tooltip, thông báo lỗi va chạm, modal xác nhận, phím tắt) đồng nhất tiếng Việt tự nhiên.
   - Tinh chỉnh CSS/typography (padding, line-height, độ rộng nút/chip trên desktop và mobile) để chữ tiếng Việt có dấu không bị cắt chữ (`truncate`), tràn khung hoặc lệch dòng.
3. **Luồng hướng dẫn trực quan (Onboarding Flow)**:
   - Thiết kế thanh hướng dẫn 4 bước ngắn gọn cho người mới (có thể tắt/ẩn) dùng icon thư viện: *Nhập bản vẽ 2D / Chọn kích thước → Đặt ngân quỹ VNĐ → Bố trí nội thất → Tham quan 3D & Xuất báo giá*.

#### Chuẩn kiểm thử hoàn thành (Acceptance Criteria)
- [ ] **Kiểm tra không còn emoji UI**: Tìm kiếm trong `panels/` và `lib/constants.ts` không còn emoji rời rạc dùng làm biểu tượng giao diện; mọi tile trong Catalogue và nút công cụ đều hiển thị SVG icon sắc nét ở cả Dark/Light theme.
- [ ] **Kiểm tra 100% Tiếng Việt**: Duyệt qua tất cả các tab (`Xây dựng`, `Nội thất`, `Phong cách`, `Quản lý`), chế độ `2D`, `3D`, `Đi bộ (Explore)` và các thông báo lỗi → không còn sót chữ tiếng Anh lẫn lộn ở giao diện người dùng (khi đang chọn ngôn ngữ VI).
- [ ] **Responsive & Typography**: Kiểm tra ở kích thước Desktop (`1440×900`) và Mobile (`390×844`) → nhãn tiếng Việt có dấu hiển thị đầy đủ, không vỡ layout, không che khuất viewport 3D.
- [ ] **CI & Tests**: `npm run typecheck`, `npx eslint --max-warnings=0`, `lib/docs-drift.test.ts` và các test React panel (`*.react.test.tsx`) đều pass.

---

## Lộ trình ghép nhánh & Nghiệm thu cuối
1. Mỗi thành viên làm việc trên nhánh riêng tách từ `feat/2d-blueprint-to-3d-vnd` (ví dụ: `feat/hoaivu-blueprint-boq` và `feat/nhatminh-arch-ui-vi`).
2. Trước khi tạo Pull Request gộp nhánh, chạy đủ bộ lệnh kiểm tra:
   ```powershell
   npm run typecheck
   npm run lint
   npm test
   npm run build
   ```
3. Kiểm thử chéo (Cross-test): Dùng **ảnh bản vẽ mặt bằng thật hoặc file PDF/DXF** (Hoài Vũ) → dựng lên **mô hình đa giác/nhà phố** (Nhật Minh) → bố trí nội thất với **giao diện 100% tiếng Việt, icon SVG chuẩn** (Nhật Minh) → xuất **Bảng dự toán BOQ bằng VNĐ** (Hoài Vũ).
