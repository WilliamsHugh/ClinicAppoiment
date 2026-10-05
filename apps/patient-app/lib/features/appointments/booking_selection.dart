import '../doctors/doctor_models.dart';

/// Dữ liệu Doctor chuyển cho luồng Booking sau khi bệnh nhân chọn khung giờ.
/// Việc chọn khung giờ chưa tạo hoặc giữ chỗ cho lịch hẹn.
class BookingSelection {
  const BookingSelection({
    required this.doctorId,
    required this.doctorName,
    required this.specialtyId,
    required this.startAt,
    required this.endAt,
  });

  final String doctorId;
  final String doctorName;
  final String specialtyId;
  final DateTime startAt;
  final DateTime endAt;

  factory BookingSelection.fromDoctorSlot(Doctor doctor, DoctorSlot slot) =>
      BookingSelection(
        doctorId: doctor.id,
        doctorName: doctor.displayName,
        specialtyId: doctor.specialtyId,
        startAt: slot.startAt,
        endAt: slot.endAt,
      );

  String get displayTime =>
      '${clinicDate(startAt)} ${clinicTime(startAt)}–${clinicTime(endAt)}';
}
