"use client";

import React, { useState, useMemo, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Calendar,
  Clock,
  MapPin,
  Phone,
  Search,
  Star,
  Stethoscope,
  Microscope,
  Ambulance,
  ClipboardList,
  Pill,
  Smartphone,
  Video,
  X,
  Info,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Menu,
} from "lucide-react";
import { useSession } from "../../lib/session/session-context";
import { clinicRoleLabel, sessionDisplayName } from "../../lib/session/session";
import { Modal, Skeleton } from "../../components/ui";
import styles from "./clinic-landing.module.css";

interface DoctorItem {
  id: string;
  name: string;
  specialty: string;
  room: string;
  experience: string;
  available: boolean;
  rating: number;
}

const SAMPLE_DOCTORS: DoctorItem[] = [
  {
    id: "doc-1",
    name: "BS. CKI Trần Văn An",
    specialty: "Nhi khoa (Pediatrics)",
    room: "Phòng 102 - Tầng 1",
    experience: "12 năm kinh nghiệm",
    available: true,
    rating: 4.9,
  },
  {
    id: "doc-2",
    name: "ThS. BS Lê Thị Mai",
    specialty: "Tim mạch (Cardiology)",
    room: "Phòng 204 - Tầng 2",
    experience: "15 năm kinh nghiệm",
    available: true,
    rating: 5.0,
  },
  {
    id: "doc-3",
    name: "BS. CKII Nguyễn Minh Tuấn",
    specialty: "Tai Mũi Họng (ENT)",
    room: "Phòng 108 - Tầng 1",
    experience: "18 năm kinh nghiệm",
    available: false,
    rating: 4.8,
  },
  {
    id: "doc-4",
    name: "BS. Đỗ Hoàng Yến",
    specialty: "Răng Hàm Mặt (Dental)",
    room: "Phòng 301 - Tầng 3",
    experience: "9 năm kinh nghiệm",
    available: true,
    rating: 4.9,
  },
  {
    id: "doc-5",
    name: "BS. Phạm Quốc Huy",
    specialty: "Nội tổng quát (Internal Medicine)",
    room: "Phòng 105 - Tầng 1",
    experience: "14 năm kinh nghiệm",
    available: true,
    rating: 4.8,
  },
  {
    id: "doc-6",
    name: "ThS. BS Vũ Bích Phương",
    specialty: "Da liễu (Dermatology)",
    room: "Phòng 206 - Tầng 2",
    experience: "11 năm kinh nghiệm",
    available: true,
    rating: 4.9,
  },
];

interface BlogArticle {
  id: string;
  title: string;
  category: string;
  doctor: string;
  readTime: string;
  summary: string;
  content: string[];
}

const SAMPLE_BLOGS: BlogArticle[] = [
  {
    id: "blog-1",
    title: "5 Thói quen đơn giản giúp duy trì trái tim khỏe mạnh mỗi ngày",
    category: "Tim mạch",
    doctor: "ThS. BS Lê Thị Mai",
    readTime: "5 phút đọc",
    summary:
      "Tăng cường sức khỏe tim mạch bắt đầu từ chế độ ăn giảm muối, 30 phút đi bộ mỗi ngày và duy trì giấc ngủ đủ 7-8 tiếng.",
    content: [
      "Bệnh lý tim mạch hiện là nguyên nhân hàng đầu gây ảnh hưởng sức khỏe lâu dài. Tuy nhiên, hơn 80% các biến cố tim mạch sớm có thể phòng ngừa bằng cách thay đổi lối sống chủ động.",
      "Thứ nhất, hạn chế lượng natri dưới 2g/ngày (khoảng 1 thìa cà phê muối). Thứ hai, duy trì vận động thể chất vừa sức ít nhất 150 phút mỗi tuần. Thứ ba, nói không với thuốc lá và kiểm soát cân nặng hợp lý.",
      "Đặc biệt, khám định kỳ đo điện tâm đồ và siêu âm tim hàng năm giúp phát hiện sớm các nguy cơ xơ vữa mạch máu từ giai đoạn tiền lâm sàng.",
    ],
  },
  {
    id: "blog-2",
    title: "Hướng dẫn chăm sóc và tăng cường miễn dịch cho trẻ khi giao mùa",
    category: "Nhi khoa",
    doctor: "BS. CKI Trần Văn An",
    readTime: "4 phút đọc",
    summary:
      "Thời tiết giao mùa khiến trẻ nhỏ dễ mắc các bệnh đường hô hấp. Cùng chuyên gia Nhi khoa tìm hiểu các bước phòng ngừa hiệu quả.",
    content: [
      "Trẻ em dưới 5 tuổi có hệ thống miễn dịch chưa hoàn thiện, là đối tượng dễ bị tấn công bởi virus cúm, RSV và vi khuẩn gây viêm phế quản.",
      "Phụ huynh cần giữ ấm vùng cổ ngực, vệ sinh mũi họng hàng ngày bằng nước muối sinh lý, và tiêm chủng vắc-xin đầy đủ đúng lịch.",
      "Khi trẻ có biểu hiện sốt cao liên tục trên 38.5 độ C, thở nhanh rút lõm lồng ngực hoặc li bì bú kém, cần đưa trẻ đến cơ sở y tế chuyên khoa ngay để được thăm khám kịp thời.",
    ],
  },
  {
    id: "blog-3",
    title: "Khám sức khỏe tổng quát định kỳ: Những danh mục thiết yếu bạn cần biết",
    category: "Nội tổng quát",
    doctor: "BS. Phạm Quốc Huy",
    readTime: "6 phút đọc",
    summary:
      "Tầm soát sức khỏe định kỳ không chỉ kiểm tra cơ bản mà còn phát hiện sớm tiểu đường, mỡ máu cao và bệnh lý gan mật tiềm ẩn.",
    content: [
      "Nhiều bệnh lý chuyển hóa như đái tháo đường týp 2 hay rối loạn lipid máu thường diễn tiến âm thầm mà không có triệu chứng cảnh báo rõ rệt.",
      "Một gói khám sức khỏe tổng quát chuẩn cần bao gồm: xét nghiệm huyết học, sinh hóa máu (đường huyết, men gan, chức năng thận, mỡ máu), siêu âm ổ bụng tổng quát và chụp X-quang tim phổi.",
      "Chủ động kiểm tra sức khỏe 6-12 tháng/lần là cách đầu tư thông minh và bền vững nhất cho chất lượng cuộc sống của bản thân và gia đình.",
    ],
  },
];

interface FaqItem {
  question: string;
  answer: string;
}

const FAQ_LIST: FaqItem[] = [
  {
    question: "Làm thế nào để tôi đặt lịch hẹn khám tại Health&Human?",
    answer:
      "Bạn có thể dễ dàng đặt lịch bằng 3 cách: (1) Sử dụng thanh tìm kiếm bác sĩ ngay trên trang chủ để xem lịch và đăng ký, (2) Tải ứng dụng di động Health&Human Patient App để chủ động chọn ngày giờ và nhận vé QR điện tử, hoặc (3) Gọi trực tiếp hotline tiếp đón 1900 8899 phục vụ 24/7.",
  },
  {
    question: "Quy trình check-in không cần bốc số tại phòng khám hoạt động ra sao?",
    answer:
      "Sau khi đăng ký thành công qua ứng dụng hoặc tổng đài, bạn sẽ có một mã QR định danh cuộc hẹn. Khi đến phòng khám, bạn chỉ cần đưa mã QR trước máy Kiosk thông minh tại sảnh tiếp đón để xác nhận có mặt trong 3 giây và vào thẳng phòng khám chuyên khoa theo giờ hẹn.",
  },
  {
    question: "Phòng khám có chấp nhận BHYT và bảo lãnh viện phí tư nhân không?",
    answer:
      "Có. Health&Human áp dụng đầy đủ quyền lợi Bảo hiểm Y tế nhà nước theo đúng quy định. Đồng thời, phòng khám liên kết bảo lãnh viện phí trực tiếp với hơn 20 công ty bảo hiểm uy tín (Bảo Việt, PTI, Manulife, Prudential, PVI, v.v.), giúp bệnh nhân được bồi hoàn thanh toán nhanh chóng.",
  },
  {
    question: "Tôi có thể xem lại kết quả xét nghiệm và đơn thuốc sau khi khám ở đâu?",
    answer:
      "Toàn bộ hồ sơ bệnh án điện tử, kết quả xét nghiệm, chẩn đoán hình ảnh và đơn thuốc sẽ được cập nhật tức thì trên ứng dụng Health&Human Patient App ngay sau khi bác sĩ kết luận buổi khám. Bạn có thể tra cứu và tải về bất kỳ lúc nào.",
  },
  {
    question: "Thời gian làm việc và tiếp nhận cấp cứu của phòng khám?",
    answer:
      "Phòng khám làm việc từ Thứ Hai đến Chủ Nhật, khung giờ 07:00 – 20:30 hàng ngày. Khu vực cấp cứu lưu bệnh và đường dây nóng hỗ trợ khẩn cấp 1900 8899 luôn hoạt động liên tục 24/7.",
  },
];

export function ClinicLandingPage() {
  const session = useSession();

  // Search states
  const [searchName, setSearchName] = useState("");
  const [selectedSpecialty, setSelectedSpecialty] = useState("all");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Active navigation tracking & mobile menu
  const [activeSection, setActiveSection] = useState<string>("home");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // FAQ accordion state
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  // Blog reading modal state
  const [readingBlog, setReadingBlog] = useState<BlogArticle | null>(null);

  // Booking prompt modal state
  const [bookingDoctor, setBookingDoctor] = useState<DoctorItem | null>(null);

  const isAuthenticated = session.status === "authenticated" && !!session.identity;
  const userRole = session.identity?.role;
  const isWorkforceRole = userRole === "DOCTOR" || userRole === "STAFF" || userRole === "ADMIN";
  const userName = sessionDisplayName(session.identity) || session.identity?.email || "Tài khoản";

  // Dynamic scroll listener to track the active section
  useEffect(() => {
    const handleScroll = () => {
      // If near the top, always highlight Home
      if (window.scrollY < 280) {
        setActiveSection("home");
        return;
      }

      // If document is scrollable and reached the bottom, highlight blogs
      const isScrollable = document.documentElement.scrollHeight > window.innerHeight + 100;
      if (isScrollable && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 70) {
        setActiveSection("blogs");
        return;
      }

      const scrollPosition = window.scrollY + 140;
      const sections = ["services", "contact", "help", "blogs"];

      for (let i = sections.length - 1; i >= 0; i--) {
        const id = sections[i];
        const el = document.getElementById(id);
        if (el) {
          const top = el.offsetTop;
          if (scrollPosition >= top) {
            setActiveSection(id);
            break;
          }
        }
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const filteredDoctors = useMemo(() => {
    return SAMPLE_DOCTORS.filter((doc) => {
      if (searchName.trim()) {
        const query = searchName.toLowerCase().trim();
        const matchesName = doc.name.toLowerCase().includes(query);
        const matchesSpec = doc.specialty.toLowerCase().includes(query);
        if (!matchesName && !matchesSpec) return false;
      }
      if (selectedSpecialty !== "all") {
        if (!doc.specialty.toLowerCase().includes(selectedSpecialty.toLowerCase())) {
          return false;
        }
      }
      if (availableOnly && !doc.available) {
        return false;
      }
      return true;
    });
  }, [searchName, selectedSpecialty, availableOnly]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setHasSearched(true);
  };

  const scrollToSection = (id: string) => {
    setActiveSection(id);
    setIsMobileMenuOpen(false);
    if (id === "home") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const el = document.getElementById(id);
    if (el) {
      const headerOffset = 72;
      const elementPosition = el.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth",
      });
    }
  };

  return (
    <div className={styles.landingWrapper}>
      {/* --------------------------------------------------------------------
          1. Top Navigation Bar (Header)
          -------------------------------------------------------------------- */}
      <header className={styles.headerSticky}>
        <div className={styles.headerContainer}>
          {/* Brand & Logo */}
          <a
            href="#home"
            className={styles.brandGroup}
            onClick={(e) => {
              e.preventDefault();
              scrollToSection("home");
            }}
          >
            <Image
              src="/images/logo.png"
              alt="Health&Human Clinic Logo"
              width={40}
              height={40}
              className={styles.brandLogo}
              priority
            />
            <span className={styles.brandTitle}>
              Health<span className={styles.brandAmpersand}>&</span>Human
            </span>
          </a>

          {/* Nav Links */}
          <nav aria-label="Điều hướng chính">
            <ul className={styles.navLinks}>
              <li className={styles.navLinkItem}>
                <button
                  type="button"
                  className={`${styles.navLink} ${activeSection === "home" ? styles.navLinkActive : ""}`}
                  onClick={() => scrollToSection("home")}
                >
                  Trang chủ
                </button>
              </li>
              <li className={styles.navLinkItem}>
                <button
                  type="button"
                  className={`${styles.navLink} ${activeSection === "services" ? styles.navLinkActive : ""}`}
                  onClick={() => scrollToSection("services")}
                >
                  Dịch vụ
                </button>
              </li>
              <li className={styles.navLinkItem}>
                <button
                  type="button"
                  className={`${styles.navLink} ${activeSection === "contact" ? styles.navLinkActive : ""}`}
                  onClick={() => scrollToSection("contact")}
                >
                  Liên hệ
                </button>
              </li>
              <li className={styles.navLinkItem}>
                <button
                  type="button"
                  className={`${styles.navLink} ${activeSection === "help" ? styles.navLinkActive : ""}`}
                  onClick={() => scrollToSection("help")}
                >
                  Hỗ trợ
                </button>
              </li>
              <li className={styles.navLinkItem}>
                <button
                  type="button"
                  className={`${styles.navLink} ${activeSection === "blogs" ? styles.navLinkActive : ""}`}
                  onClick={() => scrollToSection("blogs")}
                >
                  Cẩm nang
                </button>
              </li>
            </ul>
          </nav>

          {/* Mobile Menu Toggle Button */}
          <button
            type="button"
            className={styles.mobileMenuToggle}
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label={isMobileMenuOpen ? "Đóng menu điều hướng" : "Mở menu điều hướng"}
          >
            {isMobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>

          {/* Auth Actions */}
          <div className={styles.authActionGroup}>
            {isAuthenticated ? (
              <>
                <div className={styles.userBadge}>
                  <span>
                    {userName} · {clinicRoleLabel(userRole)}
                  </span>
                </div>
                {isWorkforceRole && (
                  <Link href="/dashboard" className={styles.dashboardBtn}>
                    Vào Dashboard
                  </Link>
                )}
                <button
                  type="button"
                  className={styles.signUpBtn}
                  onClick={() => session.signOut()}
                >
                  Đăng xuất
                </button>
              </>
            ) : session.status === "loading" ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Skeleton width={132} height={32} borderRadius="var(--radius-md)" />
              </div>
            ) : (
              <Link href="/auth" className={styles.logInBtn}>
                Đăng nhập nội bộ
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Navigation Drawer */}
      {isMobileMenuOpen && (
        <div className={styles.mobileNavDrawer} role="dialog" aria-modal="true">
          <button
            type="button"
            className={`${styles.mobileNavLink} ${activeSection === "home" ? styles.mobileNavLinkActive : ""}`}
            onClick={() => scrollToSection("home")}
          >
            <span>Trang chủ</span>
            <ArrowRight size={16} />
          </button>
          <button
            type="button"
            className={`${styles.mobileNavLink} ${activeSection === "services" ? styles.mobileNavLinkActive : ""}`}
            onClick={() => scrollToSection("services")}
          >
            <span>Dịch vụ</span>
            <ArrowRight size={16} />
          </button>
          <button
            type="button"
            className={`${styles.mobileNavLink} ${activeSection === "contact" ? styles.mobileNavLinkActive : ""}`}
            onClick={() => scrollToSection("contact")}
          >
            <span>Liên hệ</span>
            <ArrowRight size={16} />
          </button>
          <button
            type="button"
            className={`${styles.mobileNavLink} ${activeSection === "help" ? styles.mobileNavLinkActive : ""}`}
            onClick={() => scrollToSection("help")}
          >
            <span>Hỗ trợ</span>
            <ArrowRight size={16} />
          </button>
          <button
            type="button"
            className={`${styles.mobileNavLink} ${activeSection === "blogs" ? styles.mobileNavLinkActive : ""}`}
            onClick={() => scrollToSection("blogs")}
          >
            <span>Cẩm nang</span>
            <ArrowRight size={16} />
          </button>
        </div>
      )}

      {/* --------------------------------------------------------------------
          2. Hero Section
          -------------------------------------------------------------------- */}
      <section id="home" className={styles.heroSection} aria-labelledby="hero-main-heading">
        <div className={styles.heroGrid}>
          {/* Left Hero Content */}
          <div className={styles.heroContent}>
            <h1 id="hero-main-heading" className={styles.heroHeading}>
              Chăm Sóc Y Tế Chất Lượng Cao Tại{" "}
              <span className={styles.highlightBrand}>Health&Human</span> Vì Một{" "}
              <span className={styles.highlightAccent}>Tương Lai Khỏe Mạnh Hơn</span>
            </h1>

            <p className={styles.heroDescription}>
              Tại Hệ thống Phòng khám Health&Human, chúng tôi tận tâm mang đến dịch vụ y tế chuẩn
              mực, an toàn và chuyên nghiệp cho người bệnh cùng gia đình. Đội ngũ bác sĩ giàu
              kinh nghiệm, trang thiết bị tiên tiến cùng quy trình điều trị toàn diện luôn đồng
              hành vì sức khỏe của bạn.
            </p>

            <div className={styles.heroActionRow}>
              <button
                type="button"
                className={styles.btnAppointments}
                onClick={() => scrollToSection("find-doctor")}
              >
                Đặt lịch khám
              </button>

              <button
                type="button"
                className={styles.btnWatchVideo}
                onClick={() => scrollToSection("services")}
                aria-label="Xem các dịch vụ chuyên khoa của phòng khám"
              >
                <span className={styles.playCircle} aria-hidden="true">
                  <ArrowRight size={16} color="#ffffff" />
                </span>
                <span className={styles.watchVideoText}>Xem dịch vụ khám</span>
              </button>
            </div>
          </div>

          {/* Right Hero Visual: Doctor & Floating Badges */}
          <div className={styles.doctorVisualContainer}>
            {/* Organic Green Blob Shape */}
            <div className={styles.organicBlobBackdrop} aria-hidden="true" />

            {/* Doctor Image */}
            <Image
              src="/images/doctor-figure.png"
              alt="Đội ngũ bác sĩ chuyên khoa Health&Human"
              width={500}
              height={358}
              className={styles.doctorImage}
              priority
            />

            {/* Floating Badge 1: 24/7 Service */}
            <div className={styles.floatingBadgeService}>
              <span className={styles.badgeNumberBrand}>24/7</span>
              <span className={styles.badgeLabelMuted}>Trực cấp cứu</span>
            </div>

            {/* Floating Badge 2: Our Professionals 30+ */}
            <div className={styles.floatingBadgeProfessionals}>
              <span className={styles.professionalsTitle}>Đội ngũ chuyên gia</span>
              <div className={styles.avatarStackRow}>
                <div className={styles.avatarMini}>BS</div>
                <div className={styles.avatarMini} style={{ backgroundColor: "var(--brand-light)", color: "var(--brand)" }}>
                  TS
                </div>
                <div className={styles.avatarMini} style={{ backgroundColor: "var(--warning-light)", color: "var(--warning)" }}>
                  CK
                </div>
                <div className={styles.avatarMini} style={{ backgroundColor: "var(--info-light)", color: "var(--info)" }}>
                  DS
                </div>
                <span className={styles.badgeCounter}>30+</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------------
          3. Find A Doctor Card (Floating Search Bar)
          -------------------------------------------------------------------- */}
      <section
        id="find-doctor"
        className={styles.findDoctorCard}
        aria-labelledby="find-doctor-heading"
      >
        <h2 id="find-doctor-heading" className={styles.findDoctorTitle}>
          Tìm kiếm bác sĩ
        </h2>

        <form onSubmit={handleSearch} className={styles.findDoctorForm}>
          <div className={styles.inputGroup}>
            <label htmlFor="doctor-name-search" className="sr-only" style={{ display: "none" }}>
              Tên bác sĩ
            </label>
            <input
              id="doctor-name-search"
              type="text"
              className={styles.textInput}
              placeholder="Nhập tên bác sĩ hoặc chuyên khoa..."
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
            />
          </div>

          <div className={styles.inputGroup}>
            <label htmlFor="specialty-select" className="sr-only" style={{ display: "none" }}>
              Chuyên khoa
            </label>
            <select
              id="specialty-select"
              className={styles.selectInput}
              value={selectedSpecialty}
              onChange={(e) => setSelectedSpecialty(e.target.value)}
            >
              <option value="all">Tất cả chuyên khoa</option>
              <option value="Nhi">Nhi khoa (Pediatrics)</option>
              <option value="Tim">Tim mạch (Cardiology)</option>
              <option value="Tai Mũi Họng">Tai Mũi Họng (ENT)</option>
              <option value="Răng">Răng Hàm Mặt (Dental)</option>
              <option value="Nội">Nội tổng quát (Internal Medicine)</option>
              <option value="Da liễu">Da liễu (Dermatology)</option>
            </select>
          </div>

          <div
            className={styles.toggleContainer}
            onClick={() => setAvailableOnly((prev) => !prev)}
            role="switch"
            aria-checked={availableOnly}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setAvailableOnly((prev) => !prev);
              }
            }}
          >
            <span className={styles.toggleLabel}>Đang nhận lịch</span>
            <div
              className={`${styles.toggleSwitch} ${availableOnly ? styles.toggleSwitchActive : ""}`}
            >
              <div
                className={`${styles.toggleKnob} ${availableOnly ? styles.toggleKnobActive : ""}`}
              />
            </div>
          </div>

          <button type="submit" className={styles.searchSubmitBtn}>
            <Search size={18} aria-hidden="true" />
            Tìm kiếm
          </button>
        </form>

        {/* Live Search Results */}
        {(hasSearched || searchName || selectedSpecialty !== "all" || availableOnly) && (
          <div className={styles.searchResultsSection}>
            <div className={styles.resultsHeader}>
              <span className={styles.resultsCount}>
                Tìm thấy {filteredDoctors.length} bác sĩ phù hợp
              </span>
              <button
                type="button"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--muted)",
                  fontSize: "13px",
                  cursor: "pointer",
                }}
                onClick={() => {
                  setSearchName("");
                  setSelectedSpecialty("all");
                  setAvailableOnly(false);
                  setHasSearched(false);
                }}
              >
                Đặt lại bộ lọc
              </button>
            </div>

            {filteredDoctors.length === 0 ? (
              <div style={{ textAlign: "center", padding: "28px 0", color: "var(--muted)" }}>
                <p style={{ margin: 0, fontWeight: 500 }}>
                  Không tìm thấy bác sĩ nào phù hợp với điều kiện tìm kiếm. Vui lòng thử chọn
                  chuyên khoa khác.
                </p>
              </div>
            ) : (
              <div className={styles.doctorResultsGrid}>
                {filteredDoctors.map((doc) => (
                  <div key={doc.id} className={styles.doctorCard}>
                    <div className={styles.doctorCardHeader}>
                      <div className={styles.doctorAvatarBox}>
                        {doc.name.split(" ").slice(-1)[0][0]}
                      </div>
                      <div className={styles.doctorInfo}>
                        <h3 className={styles.doctorName}>{doc.name}</h3>
                        <span className={styles.doctorSpecialty}>{doc.specialty}</span>
                      </div>
                    </div>

                    <div className={styles.doctorMetaRow}>
                      <span>{doc.room}</span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                        <Star size={13} fill="#eab308" color="#eab308" />
                        {doc.rating}
                      </span>
                    </div>

                    <div className={styles.doctorMetaRow}>
                      <span>{doc.experience}</span>
                      {doc.available ? (
                        <span className={styles.statusAvailable}>Có lịch trống</span>
                      ) : (
                        <span className={styles.statusBusy}>Hết lịch hôm nay</span>
                      )}
                    </div>

                    <button
                      type="button"
                      className={styles.bookDoctorBtn}
                      onClick={() => setBookingDoctor(doc)}
                    >
                      Đặt khám ngay
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* --------------------------------------------------------------------
          4. Medical Services Section (#services)
          -------------------------------------------------------------------- */}
      <section id="services" className={styles.servicesSection} aria-labelledby="services-heading">
        <div className={styles.sectionHeader}>
          <div className={styles.sectionSubtitle}>Dịch Vụ Y Tế</div>
          <h2 id="services-heading" className={styles.sectionTitle}>
            Dịch Vụ Chăm Sóc Sức Khỏe Toàn Diện
          </h2>
          <p className={styles.sectionDesc}>
            Phòng khám Health&amp;Human cung cấp các giải pháp y tế hiện đại với trang thiết bị chuẩn
            quốc tế và quy trình khám chữa bệnh tận tâm.
          </p>
        </div>

        <div className={styles.servicesGrid}>
          <div className={styles.serviceCard}>
            <div className={styles.serviceIconBox}>
              <Stethoscope size={24} aria-hidden="true" />
            </div>
            <h3 className={styles.serviceTitle}>Khám Chuyên Khoa</h3>
            <p className={styles.serviceText}>
              Đội ngũ bác sĩ đầu ngành các khoa Nhi, Tim mạch, Tai Mũi Họng, Răng hàm mặt, Da liễu
              thăm khám kỹ lưỡng.
            </p>
          </div>

          <div className={styles.serviceCard}>
            <div className={styles.serviceIconBox}>
              <Calendar size={24} aria-hidden="true" />
            </div>
            <h3 className={styles.serviceTitle}>Đặt Lịch Trực Tuyến</h3>
            <p className={styles.serviceText}>
              Chọn ngày giờ khám linh hoạt, đặt lịch hẹn nhanh chóng không cần xếp hàng chờ đợi tại
              phòng khám.
            </p>
          </div>

          <div className={styles.serviceCard}>
            <div className={styles.serviceIconBox}>
              <Microscope size={24} aria-hidden="true" />
            </div>
            <h3 className={styles.serviceTitle}>Xét Nghiệm &amp; Chẩn Đoán</h3>
            <p className={styles.serviceText}>
              Hệ thống phòng xét nghiệm tự động, máy siêu âm, X-quang kỹ thuật số trả kết quả chính
              xác, nhanh chóng.
            </p>
          </div>

          <div className={styles.serviceCard}>
            <div className={styles.serviceIconBox}>
              <Ambulance size={24} aria-hidden="true" />
            </div>
            <h3 className={styles.serviceTitle}>Cấp Cứu &amp; Trực 24/7</h3>
            <p className={styles.serviceText}>
              Phòng khám luôn có đội ngũ bác sĩ và điều dưỡng trực cấp cứu 24/7 sẵn sàng hỗ trợ bệnh
              nhân kịp thời.
            </p>
          </div>

          <div className={styles.serviceCard}>
            <div className={styles.serviceIconBox}>
              <ClipboardList size={24} aria-hidden="true" />
            </div>
            <h3 className={styles.serviceTitle}>Bệnh Án Điện Tử</h3>
            <p className={styles.serviceText}>
              Lưu trữ đơn thuốc, tiền sử bệnh án minh bạch, bảo mật an toàn, dễ dàng tra cứu trên ứng
              dụng di động.
            </p>
          </div>

          <div className={styles.serviceCard}>
            <div className={styles.serviceIconBox}>
              <Pill size={24} aria-hidden="true" />
            </div>
            <h3 className={styles.serviceTitle}>Nhà Thuốc Đạt Chuẩn GPP</h3>
            <p className={styles.serviceText}>
              Cung ứng đầy đủ các loại thuốc đặc trị theo đơn bác sĩ với nguồn gốc xuất xứ rõ ràng và
              hướng dẫn tận tình.
            </p>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------------
          5. Why Choose Us / Statistics (#about)
          -------------------------------------------------------------------- */}
      <section id="about" className={styles.statsSection} aria-label="Thống kê phòng khám">
        <div className={styles.statsContainer}>
          <div className={styles.statItem}>
            <span className={styles.statNumber}>15+</span>
            <span className={styles.statLabel}>Năm kinh nghiệm</span>
          </div>

          <div className={styles.statItem}>
            <span className={styles.statNumber}>30+</span>
            <span className={styles.statLabel}>Bác sĩ chuyên khoa</span>
          </div>

          <div className={styles.statItem}>
            <span className={styles.statNumber}>99.2%</span>
            <span className={styles.statLabel}>Bệnh nhân hài lòng</span>
          </div>

          <div className={styles.statItem}>
            <span className={styles.statNumber}>24/7</span>
            <span className={styles.statLabel}>Sẵn sàng tiếp đón</span>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------------
          6. Contact & Patient App Section (#contact)
          -------------------------------------------------------------------- */}
      <section id="contact" className={styles.contactSection} aria-labelledby="contact-heading">
        <div className={styles.contactGrid}>
          {/* Clinic Contact Info */}
          <div className={styles.contactInfoCol}>
            <h2 id="contact-heading" className={styles.contactTitle}>
              Liên Hệ &amp; Vị Trí Phòng Khám
            </h2>
            <p className={styles.contactDesc}>
              Health&amp;Human luôn sẵn lòng lắng nghe và tư vấn giải pháp sức khỏe tốt nhất cho bạn
              và gia đình.
            </p>

            <div className={styles.contactDetailItem}>
              <div className={styles.contactIconCircle} aria-hidden="true">
                <MapPin size={18} />
              </div>
              <div>
                <div className={styles.contactDetailLabel}>Địa chỉ</div>
                <div className={styles.contactDetailValue}>
                  Số 123 Đường Y Dược, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh
                </div>
              </div>
            </div>

            <div className={styles.contactDetailItem}>
              <div className={styles.contactIconCircle} aria-hidden="true">
                <Phone size={18} />
              </div>
              <div>
                <div className={styles.contactDetailLabel}>Hotline 24/7</div>
                <div className={styles.contactDetailValue}>1900 8899 · (028) 3822 5588</div>
              </div>
            </div>

            <div className={styles.contactDetailItem}>
              <div className={styles.contactIconCircle} aria-hidden="true">
                <Clock size={18} />
              </div>
              <div>
                <div className={styles.contactDetailLabel}>Giờ làm việc</div>
                <div className={styles.contactDetailValue}>
                  Thứ 2 – Chủ Nhật: 07:00 – 20:30 (Cấp cứu trực 24/7)
                </div>
              </div>
            </div>
          </div>

          {/* Patient App CTA Card */}
          <div className={styles.patientAppCard}>
            <div>
              <h3 className={styles.patientAppTitle}>Ứng Dụng Đặt Lịch Cho Bệnh Nhân</h3>
              <p className={styles.patientAppText}>
                Tải ứng dụng <strong>Health&amp;Human Patient App</strong> trên điện thoại để đặt lịch
                khám với bác sĩ, nhận mã QR check-in không cần bốc số, và theo dõi kết quả xét nghiệm
                ngay trên máy của bạn.
              </p>
            </div>

            <div>
              <div className={styles.patientAppBadges}>
                <span className={styles.appStoreBadge}>
                  <Smartphone size={15} aria-hidden="true" /> Ứng dụng Android (Flutter)
                </span>
              </div>
              <p style={{ margin: "14px 0 0 0", fontSize: "13px", color: "rgba(255,255,255,0.8)" }}>
                Bệnh nhân đăng ký và sử dụng dịch vụ trực tiếp qua ứng dụng di động.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------------
          7. Help & Frequently Asked Questions (#help)
          -------------------------------------------------------------------- */}
      <section id="help" className={styles.helpSection} aria-labelledby="help-heading">
        <div className={styles.helpContainer}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionSubtitle}>Hỗ Trợ Bệnh Nhân</div>
            <h2 id="help-heading" className={styles.sectionTitle}>
              Trung Tâm Trợ Giúp &amp; Giải Đáp Thắc Mắc
            </h2>
            <p className={styles.sectionDesc}>
              Giải đáp nhanh các câu hỏi thường gặp về quy trình đặt lịch, khám chữa bệnh và thanh
              toán bảo hiểm tại Health&amp;Human.
            </p>
          </div>

          <div className={styles.faqList}>
            {FAQ_LIST.map((faq, idx) => {
              const isOpen = openFaqIndex === idx;
              return (
                <div
                  key={idx}
                  className={`${styles.faqItem} ${isOpen ? styles.faqItemOpen : ""}`}
                >
                  <button
                    type="button"
                    className={styles.faqQuestionBtn}
                    onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                    aria-expanded={isOpen}
                  >
                    <span>{faq.question}</span>
                    <span className={styles.faqIcon}>
                      {isOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </span>
                  </button>
                  {isOpen && <div className={styles.faqAnswer}>{faq.answer}</div>}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------------
          7. Medical Blogs & Health Guide (#blogs)
          -------------------------------------------------------------------- */}
      <section id="blogs" className={styles.blogsSection} aria-labelledby="blogs-heading">
        <div className={styles.blogsContainer}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionSubtitle}>Cẩm Nang Sức Khỏe</div>
            <h2 id="blogs-heading" className={styles.sectionTitle}>
              Tin Tức &amp; Kiến Thức Y Khoa
            </h2>
            <p className={styles.sectionDesc}>
              Thông tin y học thường thức được biên soạn bởi đội ngũ bác sĩ chuyên khoa Health&amp;Human.
            </p>
          </div>

          <div className={styles.blogsGrid}>
            {SAMPLE_BLOGS.map((blog) => (
              <article key={blog.id} className={styles.blogCard}>
                <div className={styles.blogContent}>
                  <span className={styles.blogCategoryBadge}>{blog.category}</span>
                  <h3 className={styles.blogTitle}>{blog.title}</h3>
                  <p className={styles.blogSummary}>{blog.summary}</p>
                  <div className={styles.blogMetaRow}>
                    <span>
                      {blog.doctor} · {blog.readTime}
                    </span>
                    <button
                      type="button"
                      className={styles.blogReadBtn}
                      onClick={() => setReadingBlog(blog)}
                    >
                      Đọc tiếp <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------------
          8. Booking Doctor Dialog (Shared Modal Component)
          -------------------------------------------------------------------- */}
      <Modal
        isOpen={Boolean(bookingDoctor)}
        onClose={() => setBookingDoctor(null)}
        title={bookingDoctor ? `Đặt lịch khám với ${bookingDoctor.name}` : "Đặt lịch khám"}
        footer={
          <>
            <button
              type="button"
              className={styles.signUpBtn}
              style={{ borderColor: "var(--line)", color: "var(--muted)" }}
              onClick={() => setBookingDoctor(null)}
            >
              Để sau
            </button>
            <a href="tel:19008899" className={styles.logInBtn} style={{ textDecoration: "none" }}>
              Gọi tổng đài 1900 8899
            </a>
          </>
        }
      >
        {bookingDoctor && (
          <div>
            <p style={{ color: "var(--brand)", fontWeight: 600, margin: "0 0 16px 0" }}>
              {bookingDoctor.specialty} · {bookingDoctor.room}
            </p>
            <div
              style={{
                backgroundColor: "var(--surface-subtle)",
                border: "1px solid var(--line)",
                borderRadius: "var(--radius-lg)",
                padding: "16px",
                fontSize: "14px",
                color: "var(--ink)",
                lineHeight: 1.6,
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
              }}
            >
              <Info size={18} color="var(--brand)" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <strong>Dành cho Bệnh nhân:</strong> Để hoàn tất đặt hẹn và nhận vé khám QR, bạn có
                thể tải ứng dụng <strong>Health&amp;Human Patient App</strong> trên điện thoại hoặc gọi
                hotline tiếp đón <strong>1900 8899</strong> để được hỗ trợ giữ chỗ nhanh nhất.
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* --------------------------------------------------------------------
          Blog Article Reading Modal (Shared Modal Component)
          -------------------------------------------------------------------- */}
      <Modal
        isOpen={Boolean(readingBlog)}
        onClose={() => setReadingBlog(null)}
        title={readingBlog ? readingBlog.title : "Cẩm nang y khoa"}
        maxWidth="640px"
        footer={
          <>
            <button
              type="button"
              className={styles.logInBtn}
              onClick={() => {
                setReadingBlog(null);
                scrollToSection("find-doctor");
              }}
            >
              Đặt Lịch Khám Chuyên Khoa
            </button>
            <button
              type="button"
              className={styles.signUpBtn}
              style={{ borderColor: "var(--line)", color: "var(--muted)" }}
              onClick={() => setReadingBlog(null)}
            >
              Đóng
            </button>
          </>
        }
      >
        {readingBlog && (
          <div>
            <div style={{ marginBottom: 10 }}>
              <span className={styles.blogCategoryBadge}>{readingBlog.category}</span>
            </div>
            <p
              style={{
                color: "var(--brand)",
                fontSize: "13.5px",
                fontWeight: 600,
                margin: "0 0 18px 0",
              }}
            >
              Tác giả: {readingBlog.doctor} · {readingBlog.readTime}
            </p>
            <div
              style={{
                color: "var(--ink)",
                lineHeight: 1.7,
                fontSize: "15px",
                display: "flex",
                flexDirection: "column",
                gap: "14px",
              }}
            >
              {readingBlog.content.map((paragraph, pIdx) => (
                <p key={pIdx} style={{ margin: 0 }}>
                  {paragraph}
                </p>
              ))}
            </div>
          </div>
        )}
      </Modal>

      {/* --------------------------------------------------------------------
          9. Footer
          -------------------------------------------------------------------- */}
      <footer className={styles.footerContainer}>
        <div className={styles.footerInner}>
          <div className={styles.footerBrandCol}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Image
                src="/images/logo.png"
                alt="Health&Human Logo"
                width={32}
                height={32}
                style={{ objectFit: "contain" }}
              />
              <span className={styles.footerBrandTitle}>Health&amp;Human</span>
            </div>
            <p className={styles.footerBrandText}>
              Hệ thống phòng khám đa khoa kỹ thuật số hiện đại, nâng tầm chất lượng chăm sóc sức
              khỏe người Việt.
            </p>
          </div>

          <div>
            <h4 className={styles.footerColTitle}>Dịch vụ</h4>
            <ul className={styles.footerLinkList}>
              <li>
                <a
                  href="#services"
                  className={styles.footerLink}
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSection("services");
                  }}
                >
                  Khám Nhi khoa
                </a>
              </li>
              <li>
                <a
                  href="#services"
                  className={styles.footerLink}
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSection("services");
                  }}
                >
                  Khám Tim mạch
                </a>
              </li>
              <li>
                <a
                  href="#services"
                  className={styles.footerLink}
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSection("services");
                  }}
                >
                  Tai Mũi Họng
                </a>
              </li>
              <li>
                <a
                  href="#services"
                  className={styles.footerLink}
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSection("services");
                  }}
                >
                  Nội tổng quát
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className={styles.footerColTitle}>Hỗ trợ</h4>
            <ul className={styles.footerLinkList}>
              <li>
                <a
                  href="#find-doctor"
                  className={styles.footerLink}
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSection("find-doctor");
                  }}
                >
                  Tra cứu bác sĩ
                </a>
              </li>
              <li>
                <a
                  href="#help"
                  className={styles.footerLink}
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSection("help");
                  }}
                >
                  Câu hỏi thường gặp (FAQ)
                </a>
              </li>
              <li>
                <a
                  href="#blogs"
                  className={styles.footerLink}
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSection("blogs");
                  }}
                >
                  Cẩm nang y khoa
                </a>
              </li>
              <li>
                <a
                  href="#contact"
                  className={styles.footerLink}
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSection("contact");
                  }}
                >
                  Liên hệ phòng khám
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className={styles.footerColTitle}>Dành cho nhân viên</h4>
            <ul className={styles.footerLinkList}>
              <li>
                <Link href="/auth" className={styles.footerLink}>
                  Cổng đăng nhập bác sĩ &amp; nhân viên
                </Link>
              </li>
              <li>
                <Link href="/auth" className={styles.footerLink}>
                  Quản trị phòng khám
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className={styles.footerBottom}>
          <span>© 2026 Health&amp;Human Clinic Management System. All rights reserved.</span>
          <span>Bảo mật dữ liệu chuẩn Y tế · Hotline 1900 8899</span>
        </div>
      </footer>
    </div>
  );
}
