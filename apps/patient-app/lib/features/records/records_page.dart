import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/api/api_models.dart';
import '../../core/api/clinic_api_client.dart';
import '../../core/session/session.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/async_states.dart';
import '../../shared/widgets/clinic_page_header.dart';
import '../../shared/widgets/clinic_search_field.dart';
import 'record_models.dart';
import 'record_repository.dart';
import 'widgets/record_card.dart';
import 'widgets/record_detail_sheet.dart';

class RecordsPage extends StatefulWidget {
  const RecordsPage({
    super.key,
    required this.tokenProvider,
    this.api,
    this.refreshVersion = 0,
  });

  final TokenProvider tokenProvider;
  final ClinicApiClient? api;
  final int refreshVersion;

  @override
  State<RecordsPage> createState() => _RecordsPageState();
}

class _RecordsPageState extends State<RecordsPage> {
  static const int _pageSize = 20;

  late ClinicApiClient _api;
  late RecordRepository _repo;
  final TextEditingController _searchController = TextEditingController();

  RequestCancellation? _cancellation;
  int _loadRequest = 0;
  int _enrichRequest = 0;

  List<MedicalRecord> _records = const [];
  int _page = 1;
  int _total = 0;
  bool _loading = true;
  bool _loadingMore = false;
  String? _errorMessage;
  String? _errorRequestId;
  String? _inlineErrorMessage;
  bool _inlineErrorFromLoadMore = false;
  String _searchQuery = '';
  bool _onlyWithPrescription = false;

  @override
  void initState() {
    super.initState();
    _api = widget.api ?? ClinicApiClient(tokenProvider: widget.tokenProvider);
    _repo = RecordRepository(_api);
    _load(refresh: true);
  }

  @override
  void didUpdateWidget(covariant RecordsPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.api != oldWidget.api ||
        widget.tokenProvider != oldWidget.tokenProvider) {
      _cancellation?.cancel();
      ++_loadRequest;
      ++_enrichRequest;
      _api = widget.api ?? ClinicApiClient(tokenProvider: widget.tokenProvider);
      _repo = RecordRepository(_api);
      _records = const [];
      _page = 1;
      _total = 0;
      _errorMessage = null;
      _errorRequestId = null;
      _inlineErrorMessage = null;
      _inlineErrorFromLoadMore = false;
      _loadingMore = false;
      _load(refresh: true);
      return;
    }

    if (widget.refreshVersion != oldWidget.refreshVersion) {
      _load(refresh: true);
    }
  }

  @override
  void dispose() {
    _cancellation?.cancel();
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _load({bool refresh = false}) async {
    if (!refresh && (_loading || _loadingMore)) return;

    _cancellation?.cancel();
    final cancellation = _cancellation = RequestCancellation();
    final requestId = ++_loadRequest;
    final enrichId = ++_enrichRequest;
    final targetPage = refresh ? 1 : _page + 1;

    setState(() {
      if (refresh) {
        _loading = true;
        _loadingMore = false;
        _errorMessage = null;
        _errorRequestId = null;
      } else {
        _loadingMore = true;
      }
      _inlineErrorMessage = null;
      _inlineErrorFromLoadMore = false;
    });

    try {
      final result = await _repo.fetchRecords(
        page: targetPage,
        limit: _pageSize,
        cancellation: cancellation,
      );
      if (!mounted || requestId != _loadRequest) return;

      final updatedList = refresh
          ? result.items
          : <MedicalRecord>[..._records, ...result.items];

      setState(() {
        _records = List<MedicalRecord>.unmodifiable(updatedList);
        _page = result.page;
        _total = result.total;
        _loading = false;
        _loadingMore = false;
        _errorMessage = null;
        _errorRequestId = null;
        _inlineErrorMessage = null;
        _inlineErrorFromLoadMore = false;
      });

      unawaited(
        _enrichDoctors(
          updatedList,
          cancellation: cancellation,
          enrichId: enrichId,
        ),
      );
    } on ApiException catch (error) {
      if (error.code == 'REQUEST_CANCELLED' ||
          cancellation.isCancelled ||
          !mounted ||
          requestId != _loadRequest) {
        return;
      }
      final friendly = recordErrorMessage(error);
      setState(() {
        if (_records.isEmpty) {
          _errorMessage = friendly;
          _errorRequestId = error.requestId;
        } else {
          _inlineErrorMessage = friendly;
          _inlineErrorFromLoadMore = !refresh;
        }
      });
    } catch (error) {
      if (cancellation.isCancelled || !mounted || requestId != _loadRequest) {
        return;
      }
      final friendly = recordErrorMessage(error);
      setState(() {
        if (_records.isEmpty) {
          _errorMessage = friendly;
          _errorRequestId = null;
        } else {
          _inlineErrorMessage = friendly;
          _inlineErrorFromLoadMore = !refresh;
        }
      });
    } finally {
      if (mounted && requestId == _loadRequest) {
        setState(() {
          _loading = false;
          _loadingMore = false;
        });
      }
    }
  }

  Future<void> _enrichDoctors(
    List<MedicalRecord> newRecords, {
    required RequestCancellation cancellation,
    required int enrichId,
  }) async {
    final idsToResolve = newRecords
        .where(
          (record) =>
              record.hasDoctorId &&
              (record.doctorName == null || record.doctorName!.trim().isEmpty),
        )
        .map((record) => record.doctorId)
        .toList(growable: false);
    if (idsToResolve.isEmpty) return;

    try {
      final resolved = await _repo.enrichDoctorNames(
        idsToResolve,
        cancellation: cancellation,
      );
      if (resolved.isEmpty ||
          cancellation.isCancelled ||
          !mounted ||
          enrichId != _enrichRequest) {
        return;
      }

      var changed = false;
      final updated = _records.map((record) {
        final doctorId = record.doctorId;
        if (doctorId == null) return record;
        final resolvedName = resolved[doctorId];
        if (resolvedName != null && resolvedName != record.doctorName) {
          changed = true;
          return record.copyWith(doctorName: resolvedName);
        }
        return record;
      }).toList(growable: false);

      if (changed && mounted && enrichId == _enrichRequest) {
        setState(() {
          _records = List<MedicalRecord>.unmodifiable(updated);
        });
      }
    } on ApiException catch (error) {
      if (error.code == 'REQUEST_CANCELLED' || cancellation.isCancelled) {
        return;
      }
      if (error.requiresAuthentication &&
          mounted &&
          enrichId == _enrichRequest) {
        setState(() {
          _inlineErrorMessage = recordErrorMessage(error);
          _inlineErrorFromLoadMore = false;
        });
      }
    } catch (_) {
      // Non-blocking enrichment errors should never break the rendered list.
    }
  }

  void _clearFilters() {
    _searchController.clear();
    setState(() {
      _searchQuery = '';
      _onlyWithPrescription = false;
    });
  }

  void _openDetail(MedicalRecord record) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => RecordDetailSheet(record: record),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: ClinicColors.scaffold,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const ClinicPageHeader(
            title: 'Hồ sơ khám',
            subtitle: 'Kết quả khám bệnh và đơn thuốc của bạn',
          ),
          Expanded(
            child: RefreshIndicator(
              color: ClinicColors.primary,
              onRefresh: () => _load(refresh: true),
              child: _buildBody(context),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBody(BuildContext context) {
    if (_loading && _records.isEmpty) {
      return _buildRefreshablePlaceholder(
        const AppLoadingState(label: 'Đang tải hồ sơ khám...'),
      );
    }

    if (_errorMessage != null && _records.isEmpty) {
      return _buildRefreshablePlaceholder(
        AppErrorState(
          message: _errorMessage!,
          requestId: _errorRequestId,
          onRetry: () => _load(refresh: true),
        ),
      );
    }

    if (_records.isEmpty) {
      return _buildRefreshablePlaceholder(
        const AppEmptyState(
          title: 'Chưa có hồ sơ khám',
          message: 'Kết quả khám bệnh và đơn thuốc của bạn sẽ hiển thị tại đây.',
          icon: Icons.description_outlined,
        ),
      );
    }

    final filtered = _records.where((record) {
      if (_onlyWithPrescription && !record.hasPrescription) {
        return false;
      }
      return record.matchesQuery(_searchQuery);
    }).toList(growable: false);

    final canLoadMore = _records.length < _total;

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      children: [
        ClinicSearchField(
          controller: _searchController,
          hintText: 'Tìm chẩn đoán, triệu chứng, bác sĩ, thuốc...',
          semanticsLabel: 'Tìm kiếm hồ sơ khám',
          onChanged: (value) => setState(() => _searchQuery = value),
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            _FilterChipButton(
              label: 'Tất cả',
              selected: !_onlyWithPrescription,
              onSelected: () => setState(() => _onlyWithPrescription = false),
            ),
            _FilterChipButton(
              label: 'Có đơn thuốc',
              selected: _onlyWithPrescription,
              onSelected: () => setState(() => _onlyWithPrescription = true),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Text(
          'Lọc cục bộ trên ${_records.length} hồ sơ đã tải',
          style: const TextStyle(
            fontSize: 12,
            color: ClinicColors.muted,
          ),
        ),
        if (_inlineErrorMessage != null) ...[
          const SizedBox(height: 12),
          _InlineErrorBanner(
            message: _inlineErrorMessage!,
            onRetry: () => _load(refresh: !_inlineErrorFromLoadMore),
          ),
        ],
        const SizedBox(height: 12),
        if (filtered.isEmpty)
          _FilteredEmptyCard(onClearFilters: _clearFilters)
        else
          for (var i = 0; i < filtered.length; i++) ...[
            if (i > 0) const SizedBox(height: 12),
            RecordCard(
              record: filtered[i],
              onTap: () => _openDetail(filtered[i]),
            ),
          ],
        if (canLoadMore) ...[
          const SizedBox(height: 16),
          Center(
            child: OutlinedButton(
              onPressed:
                  (_loading || _loadingMore) ? null : () => _load(refresh: false),
              child: _loadingMore
                  ? const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        ),
                        SizedBox(width: 8),
                        Flexible(
                          child: Text(
                            'Đang tải thêm...',
                            textAlign: TextAlign.center,
                          ),
                        ),
                      ],
                    )
                  : const Text(
                      'Tải thêm hồ sơ',
                      textAlign: TextAlign.center,
                    ),
            ),
          ),
        ],
      ],
    );
  }

  Widget _buildRefreshablePlaceholder(Widget child) {
    return LayoutBuilder(
      builder: (context, constraints) {
        return SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: constraints.maxHeight),
            child: child,
          ),
        );
      },
    );
  }
}

class _FilterChipButton extends StatelessWidget {
  const _FilterChipButton({
    required this.label,
    required this.selected,
    required this.onSelected,
  });

  final String label;
  final bool selected;
  final VoidCallback onSelected;

  @override
  Widget build(BuildContext context) {
    return ChoiceChip(
      label: Text(label),
      selected: selected,
      onSelected: (_) => onSelected(),
      showCheckmark: false,
      backgroundColor: ClinicColors.card,
      selectedColor: ClinicColors.primarySoft,
      side: BorderSide(
        color: selected ? ClinicColors.primary : ClinicColors.border,
      ),
      labelStyle: TextStyle(
        fontSize: 13,
        fontWeight: FontWeight.w600,
        color: selected ? ClinicColors.primary : ClinicColors.muted,
      ),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
      ),
      materialTapTargetSize: MaterialTapTargetSize.padded,
    );
  }
}

class _InlineErrorBanner extends StatelessWidget {
  const _InlineErrorBanner({
    required this.message,
    required this.onRetry,
  });

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: ClinicColors.dangerLight,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: ClinicColors.danger.withValues(alpha: 0.3),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          const Icon(
            Icons.error_outline,
            size: 18,
            color: ClinicColors.danger,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(
                fontSize: 12,
                color: ClinicColors.dangerDark,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          TextButton(
            onPressed: onRetry,
            child: const Text('Thử lại'),
          ),
        ],
      ),
    );
  }
}

class _FilteredEmptyCard extends StatelessWidget {
  const _FilteredEmptyCard({required this.onClearFilters});

  final VoidCallback onClearFilters;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: ClinicColors.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: ClinicColors.border),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(
            Icons.search_off_outlined,
            size: 40,
            color: ClinicColors.muted,
          ),
          const SizedBox(height: 12),
          const Text(
            'Không tìm thấy hồ sơ phù hợp',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w700,
              color: ClinicColors.ink,
            ),
          ),
          const SizedBox(height: 6),
          const Text(
            'Thử từ khóa khác hoặc xóa bộ lọc hiện tại.',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 13,
              color: ClinicColors.muted,
            ),
          ),
          const SizedBox(height: 14),
          OutlinedButton(
            onPressed: onClearFilters,
            child: const Text('Xóa bộ lọc'),
          ),
        ],
      ),
    );
  }
}
