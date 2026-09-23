import 'package:flutter/material.dart';

import '../../core/api/api_models.dart';
import '../../core/api/clinic_api_client.dart';
import '../../core/session/session.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/async_states.dart';
import 'widgets/record_card.dart';
import 'widgets/record_detail_sheet.dart';

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
      return const AppEmptyState(
        title: 'Chưa có lịch sử khám',
        message: 'Lịch sử khám được giới hạn theo phiên người bệnh sẽ hiển thị tại đây.',
        icon: Icons.description_outlined,
      );
    }
    return Scaffold(
      backgroundColor: ClinicColors.scaffold,
      appBar: AppBar(
        backgroundColor: ClinicColors.scaffold,
        title: const Text('Lịch sử khám',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: ClinicColors.ink)),
      ),
      body: RefreshIndicator(
        onRefresh: () => _load(refresh: true),
        child: ListView.separated(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
          itemCount: _records.length + 1,
          separatorBuilder: (_, __) => const SizedBox(height: 12),
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
            return RecordCard(data: r, onTap: () => _openDetail(r));
          },
        ),
      ),
    );
  }

  void _openDetail(Map<String, dynamic> record) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => RecordDetailSheet(record: record),
    );
  }
}
