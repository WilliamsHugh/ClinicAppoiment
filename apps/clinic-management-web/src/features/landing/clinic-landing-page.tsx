"use client";

import React, { useState, useMemo } from "react";
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
} from "lucide-react";
import { useSession } from "../../lib/session/session-context";
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

export interface ClinicLandingPageProps {
  onSwitchToDashboard?: () => void;
}

export function ClinicLandingPage({ onSwitchToDashboard }: ClinicLandingPageProps) {
  const session = useSession();

  // Search states
  const [searchName, setSearchName] = useState("");
  const [selectedSpecialty, setSelectedSpecialty] = useState("all");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Video modal state
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  // Booking prompt modal state
  const [bookingDoctor, setBookingDoctor] = useState<DoctorItem | null>(null);

  const isAuthenticated = session.status === "authenticated" && !!session.identity;
  const userRole = session.identity?.role;
  const isWorkforceRole = userRole === "DOCTOR" || userRole === "STAFF" || userRole === "ADMIN";

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
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
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
          <Link href="/" className={styles.brandGroup}>
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
          </Link>

          {/* Nav Links */}
          <nav aria-label="Main Navigation">
            <ul className={styles.navLinks}>
              <li className={styles.navLinkItem}>
                <a href="#" className={`${styles.navLink} ${styles.navLinkActive}`}>
                  Home
                </a>
              </li>
              <li className={styles.navLinkItem}>
                <a
                  href="#services"
                  className={styles.navLink}
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSection("services");
                  }}
                >
                  Service
                </a>
              </li>
              <li className={styles.navLinkItem}>
                <a
                  href="#contact"
                  className={styles.navLink}
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSection("contact");
                  }}
                >
                  Contact Us
                </a>
              </li>
              <li className={styles.navLinkItem}>
                <a
                  href="#about"
                  className={styles.navLink}
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSection("about");
                  }}
                >
                  Help
                </a>
              </li>
              <li className={styles.navLinkItem}>
                <a
                  href="#blogs"
                  className={styles.navLink}
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSection("blogs");
                  }}
                >
                  Blogs
                </a>
              </li>
            </ul>
          </nav>

          {/* Auth Actions */}
          <div className={styles.authActionGroup}>
            {isAuthenticated ? (
              <>
                <div className={styles.userBadge}>
                  <span>{session.identity?.displayName || "Tài khoản"}</span>
                  <span className={styles.userRolePill}>{userRole}</span>
                </div>
                {isWorkforceRole && onSwitchToDashboard && (
                  <button
                    type="button"
                    className={styles.dashboardBtn}
                    onClick={onSwitchToDashboard}
                  >
                    Vào Dashboard
                  </button>
                )}
                {isWorkforceRole && !onSwitchToDashboard && (
                  <Link href="/appointments" className={styles.dashboardBtn}>
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
            ) : (
              <>
                <Link href="/auth" className={styles.signUpBtn}>
                  Sign Up
                </Link>
                <Link href="/auth" className={styles.logInBtn}>
                  Log In
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* --------------------------------------------------------------------
          2. Hero Section
          -------------------------------------------------------------------- */}
      <section className={styles.heroSection} aria-labelledby="hero-main-heading">
        <div className={styles.heroGrid}>
          {/* Left Hero Content */}
          <div className={styles.heroContent}>
            <h1 id="hero-main-heading" className={styles.heroHeading}>
              Providing Quality Care At{" "}
              <span className={styles.highlightBrand}>Health&Human</span> For A{" "}
              <span className={styles.highlightAccent}>Brighter And Healthy Future</span>
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
                Appointments
              </button>

              <button
                type="button"
                className={styles.btnWatchVideo}
                onClick={() => setIsVideoModalOpen(true)}
                aria-label="Xem video giới thiệu phòng khám"
              >
                <span className={styles.playCircle} aria-hidden="true">
                  <span className={styles.playTriangle} />
                </span>
                <span className={styles.watchVideoText}>Watch Video</span>
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
              <span className={styles.badgeLabelMuted}>Service</span>
            </div>

            {/* Floating Badge 2: Our Professionals 30+ */}
            <div className={styles.floatingBadgeProfessionals}>
              <span className={styles.professionalsTitle}>Our Professionals</span>
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
          Find A Doctor
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
              placeholder="Name"
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
              <option value="all">Speciality (Tất cả chuyên khoa)</option>
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
            <span className={styles.toggleLabel}>Available</span>
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
            Search
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
                  color: "#64748b",
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
              <div style={{ textAlign: "center", padding: "28px 0", color: "#64748b" }}>
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
                  <Smartphone size={15} aria-hidden="true" /> Android App (Flutter)
                </span>
                <span className={styles.appStoreBadge}>
                  <Smartphone size={15} aria-hidden="true" /> iOS Patient App
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
          7. Video / Tour Modal
          -------------------------------------------------------------------- */}
      {isVideoModalOpen && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <div className={styles.modalContent}>
            <button
              type="button"
              className={styles.modalCloseBtn}
              onClick={() => setIsVideoModalOpen(false)}
              aria-label="Đóng video"
            >
              <X size={18} aria-hidden="true" />
            </button>
            <h3 style={{ fontSize: "20px", fontWeight: 800, marginTop: 0, color: "#1e293b" }}>
              Giới Thiệu Phòng Khám Health&amp;Human
            </h3>
            <p style={{ color: "#64748b", lineHeight: 1.6, fontSize: "14.5px" }}>
              Chào mừng bạn đến với chuyến tham quan không gian y tế chuẩn quốc tế của chúng tôi.
              Hệ thống phòng khám tích hợp công nghệ AI và hồ sơ điện tử đồng bộ.
            </p>
            <div
              style={{
                width: "100%",
                height: 240,
                backgroundColor: "#0f172a",
                borderRadius: 12,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                color: "#ffffff",
                gap: 12,
              }}
            >
              <Video size={40} aria-hidden="true" color="var(--brand-light)" />
              <span style={{ fontSize: "15px", fontWeight: 600 }}>
                Video Tour Giới Thiệu Phòng Khám (HD)
              </span>
              <span style={{ fontSize: "12px", color: "#94a3b8" }}>
                Thời lượng: 2 phút 15 giây
              </span>
            </div>
            <div style={{ marginTop: 20, textAlign: "right" }}>
              <button
                type="button"
                className={styles.logInBtn}
                onClick={() => setIsVideoModalOpen(false)}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------
          8. Booking Doctor Dialog
          -------------------------------------------------------------------- */}
      {bookingDoctor && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <div className={styles.modalContent}>
            <button
              type="button"
              className={styles.modalCloseBtn}
              onClick={() => setBookingDoctor(null)}
              aria-label="Đóng"
            >
              <X size={18} aria-hidden="true" />
            </button>
            <h3 style={{ fontSize: "20px", fontWeight: 800, marginTop: 0, color: "#1e293b" }}>
              Đặt Lịch Khám với {bookingDoctor.name}
            </h3>
            <p style={{ color: "#0d7a73", fontWeight: 600, margin: "4px 0 16px 0" }}>
              {bookingDoctor.specialty} · {bookingDoctor.room}
            </p>
            <div
              style={{
                backgroundColor: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                padding: "16px",
                marginBottom: "20px",
                fontSize: "14px",
                color: "#475569",
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
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button
                type="button"
                className={styles.signUpBtn}
                onClick={() => setBookingDoctor(null)}
              >
                Để sau
              </button>
              <a href="tel:19008899" className={styles.logInBtn} style={{ textDecoration: "none" }}>
                Gọi Tổng Đài 1900 8899
              </a>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------
          9. Footer
          -------------------------------------------------------------------- */}
      <footer id="blogs" className={styles.footerContainer}>
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
                <a href="#services" className={styles.footerLink}>
                  Khám Nhi khoa
                </a>
              </li>
              <li>
                <a href="#services" className={styles.footerLink}>
                  Khám Tim mạch
                </a>
              </li>
              <li>
                <a href="#services" className={styles.footerLink}>
                  Tai Mũi Họng
                </a>
              </li>
              <li>
                <a href="#services" className={styles.footerLink}>
                  Nội tổng quát
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className={styles.footerColTitle}>Hỗ trợ</h4>
            <ul className={styles.footerLinkList}>
              <li>
                <a href="#find-doctor" className={styles.footerLink}>
                  Tra cứu bác sĩ
                </a>
              </li>
              <li>
                <a href="#contact" className={styles.footerLink}>
                  Hướng dẫn đặt lịch
                </a>
              </li>
              <li>
                <a href="#contact" className={styles.footerLink}>
                  Bảo hiểm y tế
                </a>
              </li>
              <li>
                <a href="#about" className={styles.footerLink}>
                  Câu hỏi thường gặp
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
