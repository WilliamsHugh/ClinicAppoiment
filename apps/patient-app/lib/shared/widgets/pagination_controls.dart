import 'package:flutter/material.dart';

class PaginationControls extends StatelessWidget {
  const PaginationControls({
    required this.page,
    required this.limit,
    required this.total,
    required this.onPageChanged,
    super.key,
  });

  final int page;
  final int limit;
  final int total;
  final ValueChanged<int> onPageChanged;

  @override
  Widget build(BuildContext context) {
    final pageCount = total == 0 ? 1 : (total / limit).ceil();
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        IconButton(
          tooltip: 'Trang trước',
          onPressed: page > 1 ? () => onPageChanged(page - 1) : null,
          icon: const Icon(Icons.chevron_left),
        ),
        Semantics(
          liveRegion: true,
          child: Text('Trang $page / $pageCount'),
        ),
        IconButton(
          tooltip: 'Trang sau',
          onPressed: page < pageCount ? () => onPageChanged(page + 1) : null,
          icon: const Icon(Icons.chevron_right),
        ),
      ],
    );
  }
}
