import 'package:flutter/material.dart';

import '../../core/api/api_models.dart';
import '../../core/api/clinic_api_client.dart';
import '../../core/session/session.dart';
import '../../shared/widgets/async_states.dart';

class _DevTokenProvider implements TokenProvider {
  const _DevTokenProvider();
  @override
  Future<String?> getAccessToken() async => 'dev-token';
}

class RecordsPage extends StatefulWidget {
  const RecordsPage({super.key});

  @override
  State<RecordsPage> createState() => _RecordsPageState();
}

class _RecordsPageState extends State<RecordsPage> {
  late final ClinicApiClient _api;
  List<dynamic> _records = [];
  PageMetadata? _pagination;
  bool _loading = true;
  ApiException? _error;
  int _page = 1;

  @override
  void initState() {
    super.initState();
    _api = ClinicApiClient(tokenProvider: const _DevTokenProvider());
    _load();
  }

  Future<void> _load({bool refresh = false}) async {
    if (refresh) {
      setState(() => _page = 1);
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      // RECORD-006: patient history via Gateway, patient only sees own records
      final response = await _api.get(
        '/api/v1/medical-records',
        query: {'patientId': 'patient-1', 'page': _page, 'limit': 20},
      );
      final data = response.data as Map<String, dynamic>;
      final items = (data['items'] as List).cast<dynamic>();
      setState(() {
        _records = refresh ? items : (refresh ? items : [..._records, ...items]);
        if (refresh) _records = items;
        // Actually for pagination, replace or append: if page 1 replace, else append
        // Simplified: if refresh or page==1 replace
        _pagination = response.pagination;
      });
    } on ApiException catch (e) {
      setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading && _records.isEmpty) {
      return const AppLoadingState(label: 'Đang tải lịch sử khám...');
    }
    if (_error != null && _records.isEmpty) {
      return AppErrorState(
        message: _error!.message,
        requestId: _error!.requestId,
        onRetry: () => _load(refresh: true),
      );
    }
    if (_records.isEmpty) {
      return AppEmptyState(
        title: 'Chưa có lịch sử khám',
        message: 'Lịch sử khám được giới hạn theo phiên người bệnh sẽ hiển thị tại đây.',
        icon: Icons.description_outlined,
      );
    }
    return RefreshIndicator(
      onRefresh: () => _load(refresh: true),
      child: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: _records.length + 1,
        separatorBuilder: (_, __) => const Divider(height: 1),
        itemBuilder: (context, index) {
          if (index >= _records.length) {
            final canLoadMore = _pagination != null && _records.length < (_pagination!.total);
            if (!canLoadMore) return const SizedBox(height: 16);
            return Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Center(
                child: TextButton(
                  onPressed: () {
                    setState(() => _page += 1);
                    _load();
                  },
                  child: const Text('Tải thêm'),
                ),
              ),
            );
          }
          final r = _records[index] as Map<String, dynamic>;
          return ListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(
              r['diagnosis']?.toString().isNotEmpty == true
                  ? r['diagnosis'].toString()
                  : 'Kết quả khám #${r['id'].toString().substring(0, 8)}',
            ),
            subtitle: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Ngày: ${_formatDate(r['createdAt'].toString())} • Trạng thái: ${r['status']}'),
                if (r['symptoms'] != null) Text('Triệu chứng: ${r['symptoms']}', maxLines: 1, overflow: TextOverflow.ellipsis),
                if ((r['prescription'] as List?)?.isNotEmpty == true)
                  Text('Đơn thuốc: ${(r['prescription'] as List).length} loại'),
              ],
            ),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => _openDetail(r),
          );
        },
      ),
    );
  }

  void _openDetail(Map<String, dynamic> record) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.7,
        maxChildSize: 0.9,
        builder: (_, controller) => SingleChildScrollView(
          controller: controller,
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(color: Colors.grey[300], borderRadius: BorderRadius.circular(2)),
                ),
              ),
              const SizedBox(height: 16),
              Text('Chi tiết kết quả khám', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 12),
              _DetailRow(label: 'Chẩn đoán', value: record['diagnosis']?.toString() ?? '—'),
              _DetailRow(label: 'Triệu chứng', value: record['symptoms']?.toString() ?? '—'),
              _DetailRow(label: 'Ghi chú', value: record['notes']?.toString() ?? '—'),
              _DetailRow(label: 'Điều trị', value: record['treatmentPlan']?.toString() ?? '—'),
              const SizedBox(height: 12),
              Text('Đơn thuốc', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 8),
              ..._buildPrescription(record['prescription']),
              const SizedBox(height: 12),
              Text('ID lịch hẹn: ${record['appointmentId']}', style: const TextStyle(color: Colors.grey, fontSize: 12)),
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> _buildPrescription(dynamic pres) {
    if (pres == null || (pres as List).isEmpty) {
      return [const Text('Không có đơn thuốc.', style: TextStyle(color: Colors.grey))];
    }
    return (pres as List).map((p) {
      final m = p as Map<String, dynamic>;
      return Card(
        margin: const EdgeInsets.only(bottom: 8),
        child: ListTile(
          title: Text(m['medicineName'].toString(), style: const TextStyle(fontWeight: FontWeight.w600)),
          subtitle: Text('Liều: ${m['dosage']} • Tần suất: ${m['frequency']} • Thời gian: ${m['duration']}'),
        ),
      );
    }).toList();
  }

  String _formatDate(String iso) {
    try {
      final d = DateTime.parse(iso).toLocal();
      return '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}';
    } catch (_) {
      return iso;
    }
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({required this.label, required this.value});
  final String label;
  final String value;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(fontWeight: FontWeight.w600, color: Color(0xFF64748B), fontSize: 12)),
          const SizedBox(height: 2),
          Text(value),
        ],
      ),
    );
  }
}
