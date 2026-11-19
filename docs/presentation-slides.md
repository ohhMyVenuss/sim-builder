# Tổng quan dự án: Three.js Sims House Builder & 2D-to-3D Reconstructor

> Tài liệu dàn ý chi tiết (11 slides) trình bày kiến trúc, các chức năng chính, kỹ thuật dựng hình 3D và các thuật toán đồ họa máy tính cốt lõi của dự án.

---

## Slide 1: Trang bìa (Title Slide)

- **Tên dự án**: **3D House Builder & 2D Blueprint Reconstructor**
- **Mô tả ngắn**: Ứng dụng thiết kế nhà 3D, tái tạo mô hình từ bản vẽ kỹ thuật 2D và dự toán nội thất (VNĐ) chạy hoàn toàn trên trình duyệt.
- **Công nghệ nền tảng**: `Next.js 15` · `React 18` · `TypeScript` · `Three.js (WebGL)` · `Zustand`
- **Điểm nhấn**: Static SPA (100% Client-side), không cần cài đặt phần mềm CAD nặng hay backend server.

---

## Slide 2: Bài toán thực tế & Giải pháp

### Vấn đề (Problem)
- Chủ nhà và người không chuyên gặp khó khăn khi hình dung không gian sống thực tế từ **bản vẽ kỹ thuật 2D** (nhiều nét, ký hiệu tường, kích thước mm).
- Khó ước lượng **chi phí sắm sửa nội thất thực tế bằng VNĐ** so với ngân quỹ dự kiến trước khi thi công.

### Giải pháp (Solution)
- **Tái tạo 3D từ bản vẽ 2D**: Hỗ trợ tải trực tiếp bản vẽ kỹ thuật (`.dxf`, `.svg`, `.png`, `.jpg`, `.webp`) để tự động dựng thành mô hình nhà/tầng 3D.
- **Ướm thử nội thất & Dự toán VNĐ**: Bố trí 69+ món nội thất theo đơn giá bình quân thị trường Việt Nam, kiểm soát ngân quỹ theo thời gian thực và tham quan ngôi nhà ở góc nhìn thứ nhất.

---

## Slide 3: Kiến trúc tổng thể hệ thống (System Architecture)

Hệ thống được thiết kế theo **kiến trúc 4 lớp tách biệt hoàn toàn**:

1. **App Shell (`app/`)**
   - Next.js Static Export (`output: 'export'`).
   - Lazy-load trình biên tập và prefetch song song engine 3D (`three-runtime`, `OrbitControls`, `RoomEnvironment`) để loại bỏ waterfall request khi khởi động.
2. **Pure Domain (`components/room-organizer/lib/`)**
   - Toàn bộ logic hình học, va chạm, tìm đường, nhận diện phòng, phân tích bản vẽ 2D, dự toán ngân quỹ, xuất bản vẽ.
   - **Không phụ thuộc React hay Three.js**, dùng chung cho cả 2D và 3D, dễ dàng kiểm thử bằng Vitest.
3. **Rendering Engines (`three/` & `canvas-2d/`)**
   - `three/`: Dựng scene 3D WebGL, vật liệu PBR, ánh sáng, đổ bóng, shader.
   - `canvas-2d/`: Dựng mặt bằng 2D kỹ thuật đồng bộ tức thì.
4. **State & HUD (`hooks/`, `contexts/`, `panels/`)**
   - **Zustand Store** bọc Reducer pattern + Atomic Selectors (chỉ re-render đúng UI slice thay đổi).
   - **Keyed Scene Diffing** (`use-scene-effects.ts`): Chỉ rebuild đúng đối tượng 3D bị thay đổi.

---

## Slide 4: Các chức năng cốt lõi

- **Thiết kế kiến trúc đa tầng**:
  - Hỗ trợ 1–4 tầng, tùy chỉnh kích thước, mặt bằng chữ nhật hoặc chữ L, chiều cao riêng từng tầng.
  - Vẽ vách ngăn nội thất, đặt cửa đi/cửa sổ tự động đục lỗ tường, cầu thang (thẳng / chữ U), mái nhà (bằng / chữ A / mái Nhật) và cửa sổ mái (dormer).
- **Thư viện 69 món nội thất & trang trí**:
  - Chia 12 danh mục (Phòng khách, Phòng ngủ, Bếp, Vệ sinh, Điện tử, Camera an ninh, Cây xanh, Ngoại thất, Nhân vật...).
- **Đa góc nhìn & Xuất bản vẽ**:
  - Chế độ 3D Orbit, Mặt bằng 2D tương tác, Cắt tường thông minh (Wall Cutaway).
  - Xuất bản vẽ kỹ thuật (`SVG`, `DXF`, `PDF/Print`), xuất model `GLB`, `JSON` và chia sẻ qua URL.

---

## Slide 5: Tính năng nổi bật 1 — Dựng mô hình 3D từ Bản vẽ kỹ thuật 2D

### Định dạng đầu vào
- **AutoCAD (`.dxf`)**: Đọc trực tiếp thực thể `LINE`, `LWPOLYLINE` và hệ đơn vị `$INSUNITS` (mm, cm, m, inch, feet).
- **Vector (`.svg`)**: Parse `<line>`, `<rect>`, `<polyline>`, `<polygon>`.
- **Ảnh mặt bằng (`.png`, `.jpg`, `.webp`)**: Xử lý ảnh trực tiếp trên trình duyệt bằng `Canvas2D`.

### Pipeline 3 bước tái tạo 3D (`lib/blueprint-2d-to-3d.ts`)
1. **Trích xuất nét tường**:
   - Chuyển ảnh xám → Phân ngưỡng tự động **Otsu Thresholding** tách nét tường khỏi nền → Cắt viền nhiễu → Quét **Run-Length** ngang/dọc → Gộp tường đôi song song thành **tim tường (centerline)**.
2. **Chuẩn hóa & Làm sạch topo**:
   - Quy đổi theo **Chiều rộng thực tế (m)** người dùng nhập, căn tâm `(0, 0)`, lọc đoạn nhiễu và **Endpoint Snapping** (hút các đầu mút tường khép kín góc phòng).
3. **Xem trước & Dựng khối 3D**:
   - Hiển thị bản xem trước 2D SVG (kích thước, diện tích $m^2$, số vách ngăn) trước khi áp dụng cho tầng hiện tại hoặc tạo nhà mới (1–4 tầng), hỗ trợ giữ ảnh làm nền đối chiếu và Undo.

---

## Slide 6: Tính năng nổi bật 2 — Ướm thử nội thất & Dự toán ngân quỹ (VNĐ)

- **Bảng giá bình quân thị trường Việt Nam**:
  - Quy đổi toàn bộ 69 món nội thất trong `FURNITURE_CATALOG` sang **VNĐ (`₫` / `tr ₫`)** sát với mặt bằng giá thị trường (VD: Sofa 12 tr ₫, Giường đôi 12,5 tr ₫, Tủ lạnh 14 tr ₫, Cầu thang 25 tr ₫...).
- **Quản lý ngân quỹ ban đầu (Initial Budget)**:
  - Cho phép nhập ngân quỹ tùy chỉnh (triệu VNĐ) hoặc chọn nhanh (`100 tr`, `250 tr`, `500 tr`, `1 tỷ`).
  - Theo dõi **Tổng chi phí nội thất**, **Số tiền còn lại / Vượt ngân quỹ** trên thanh HUD, bảng Thống kê, theo từng tầng và từng phòng (Zone).
- **Chế độ Giới hạn cứng (Hard Budget)**:
  - Tự động làm mờ và chặn đặt món đồ vượt quá ngân quỹ còn lại.
  - Hỗ trợ bán/thanh lý đồ hoàn lại 80% giá trị vào ngân quỹ.

---

## Slide 7: Trải nghiệm mô phỏng & Tương tác thông minh

- **Đi bộ góc nhìn thứ nhất (Walkthrough)**:
  - Điều khiển bằng `WASD`/phím mũi tên hoặc cảm ứng, va chạm trượt mượt qua tường/đồ vật, leo cầu thang lên tầng trên, ngồi lên ghế hướng về phía TV.
- **Nhân vật NPC tự hành (AI Walkers)**:
  - Tự tìm đường di chuyển giữa các phòng, tránh vật cản, nhường đường và tìm ghế ngồi nghỉ.
- **Mô phỏng môi trường & Hạ tầng**:
  - **Ánh sáng theo thời gian thực**: Chu kỳ bình minh → trưa → hoàng hôn → ban đêm (tự bật đèn, trăng sao).
  - **Thời tiết động**: Mưa và tuyết rơi thích ứng theo địa hình dốc và mái hiên.
  - **Công cụ kỹ thuật**: Bản đồ vùng phủ sóng Wi-Fi và nón quét tầm nhìn Camera an ninh (CCTV) bị chặn bởi tường.

---

## Slide 8: Kỹ thuật dựng Model 3D (3D Modeling Pipeline)

### 1. Procedural Modeling (Dựng hình bằng code cho Nội thất & Kiến trúc)
- **`softBox()`**: Tự sinh `BufferGeometry` hộp vát cạnh chỉ tốn **44 tam giác** (nhẹ hơn ~7 lần so với `RoundedBoxGeometry`), giữ mặt phẳng và xoay normal ở cạnh vát để bắt sáng highlight; có tham số `puff` làm phồng đệm ghế mà không tăng đỉnh.
- **`mergeParts()`**: Gộp các bộ phận cùng vật liệu của một món đồ thành **1 `BufferGeometry` duy nhất**, giảm mạnh Draw Calls.
- **Kiến trúc**: Dùng `Shape` + `ExtrudeGeometry` để đục lỗ cửa đi, cửa sổ, lỗ cầu thang; tách mặt trong/ngoài tường (`withOutsideFace`) chống lỗi shadow acne.

### 2. Rigged GLB tối ưu cho Nhân vật (`people.glb`)
- Đọc `skinIndex` / `skinWeight` của xương để chia tam giác thành 9 vùng cơ thể và sắp xếp lại index buffer thành các draw group liên tiếp (`people-outfits.ts`).
- Hàng chục NPC **dùng chung 1 Geometry trên GPU** nhưng vẫn mặc trang phục và màu da khác nhau.

---

## Slide 9: Thuật toán Đồ họa máy tính & Không gian cốt lõi

- **Va chạm OBB bằng SAT (Separating Axis Theorem)** (`lib/geometry.ts`): Chiếu 2 hộp định hướng trên mặt phẳng `XZ` lên 4 trục pháp tuyến để kiểm tra va chạm chính xác khi xoay đồ; dùng **Circle-vs-OBB** cho chế độ đi bộ.
- **Tìm đường NPC** (`lib/npc-path.ts`): Rasterize mặt sàn trống thành lưới 2D → chạy **A\* 8 hướng** (Octile heuristic, Binary Min-Heap, zero-allocation) → làm mượt đường đi bằng **String-Pulling**.
- **Nhận diện phòng kín** (`lib/room-detect.ts`): Cắt biên nhà và vách ngăn thành **Đồ thị phẳng (Planar Graph)** → duyệt mặt kín & kiểm tra điểm trong đa giác (**Even-Odd Ray Casting**).
- **Procedural PBR & Custom Shaders**:
  - Sinh **Normal Map & Roughness Map** liền mạch từ heightmap bằng **sai phân trung tâm** (`three/surface-maps.ts`).
  - **Shader Patching (`onBeforeCompile`)** (`three/outdoor-lamps.ts`): Can thiệp `lights_fragment_begin` để chặn ánh sáng đèn trong nhà xuyên tường ra ngoài trời mà không cần recompile shader.
  - **GPU Particle Weather** (`three/weather.ts`): 6.000 hạt mưa / 4.500 bông tuyết chạy hoàn toàn trên **Vertex Shader** trong 1 `InstancedMesh` duy nhất.
  - **Baked 2D Contact Shadow** (`three/contact-shadow.ts`): Vẽ bóng tiếp xúc chân tường/đồ đạc bằng `Canvas2D` đặt sát sàn thay cho SSAO nặng nề.

---

## Slide 10: Tối ưu hiệu năng & Quản lý bộ nhớ GPU

- **Render-on-Demand**: Vòng lặp `requestAnimationFrame` chỉ render khi camera xoay, dữ liệu thay đổi hoặc hiệu ứng đang chạy.
- **Static Shadow Map**: Tắt `shadowMap.autoUpdate`, chỉ tính lại bóng đổ `DirectionalLight` (2048×2048 `PCFShadowMap` ôm khít bounding box nhà) khi vật cản hoặc mặt trời thay đổi.
- **Shader Warmup & Frame Budget**: Biên dịch trước shader ở frame đầu tiên tránh khựng hình; giới hạn hiệu ứng trang trí ở 30Hz và tự dừng khi tab ẩn.
- **Tree-shaking & Giải phóng VRAM**: Chỉ import các symbol cần thiết qua `three-runtime.ts`; hàm `disposeObject` / `disposeScene` giải phóng triệt để geometry, material, texture, skeleton và dùng `WeakSet` bảo vệ tài nguyên dùng chung.

---

## Slide 11: Kết luận & Hướng phát triển

### Kết quả đạt được
- Ứng dụng thiết kế nhà 3D nhẹ, mượt trên trình duyệt, khép kín quy trình: **Bản vẽ 2D → Mô hình 3D → Ướm nội thất & Dự toán VNĐ → Tham quan thực tế**.
- Đảm bảo chất lượng mã nguồn với TypeScript strict, ESLint zero-warning và bộ unit test Vitest.

### Hướng phát triển tiếp theo
- Tích hợp mô hình AI/Segmentation nhận diện trực tiếp **ký hiệu cửa đi, cửa sổ, cầu thang** và **đọc chữ kích thước (OCR)** từ ảnh bản vẽ kỹ thuật 2D.
- Mở rộng dự toán sang **chi phí vật liệu xây dựng thô & hoàn thiện** (diện tích tường sơn, gạch lát sàn theo $m^2$).
