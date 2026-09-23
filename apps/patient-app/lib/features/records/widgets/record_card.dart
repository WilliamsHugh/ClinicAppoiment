import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';

class RecordCard extends StatelessWidget {
  const RecordCard({required this.data, required this.onTap, super.key});
  final Map<String, dynamic> data;
  final VoidCallback onTap;

  String _fmt(String iso) {
    try {
      final d = DateTime.parse(iso).toLocal();
      return '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}';
    } catch (_) {
      return iso;
    }
  }

  @override
  Widget build(BuildContext context) {
    final diagnosis = data['diagnosis']?.toString();
    final title = (diagnosis != null && diagnosis.isNotEmpty)
        ? diagnosis
        : 'Kết quả khám #${data['id'].toString().substring(0, 8)}';
    final hasPres = (data['prescription'] as List?)?.isNotEmpty == true;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(20),
          boxShadow: [
            BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 12, offset: const Offset(0, 6))
          ],
        ),
        child: Row(
          children: [
            Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(color: const Color(0xFFEFF6FF), borderRadius: BorderRadius.circular(12)),
              child: const Icon(Icons.description_outlined, size: 18, color: ClinicColors.primary),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: ClinicColors.ink)),
                  const SizedBox(height: 4),
                  Text('Ngày: ${_fmt(data['createdAt'].toString())} • ${data['status']}',
                      style: const TextStyle(fontSize: 11, color: ClinicColors.muted)),
                  if (data['symptoms'] != null)
                    Text('Triệu chứng: ${data['symptoms']}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 11, color: ClinicColors.mutedLight)),
                  if (hasPres)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration:
                            BoxDecoration(color: const Color(0xFFECFDF5), borderRadius: BorderRadius.circular(8)),
                        child: Text('Đơn thuốc: ${(data['prescription'] as List).length} loại',
                            style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: Color(0xFF059669))),
                      ),
                    ),
                ],
              ),
            ),
            const Icon(Icons.chevron_right, size: 18, color: ClinicColors.mutedLight),
          ],
        ),
      ),
    );
  }
}
