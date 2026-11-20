import 'package:flutter/material.dart';

class PaginationControls extends StatelessWidget {
  const PaginationControls({
    required this.page,
    required this.limit,
    required this.total,
    required this.onPageChanged,
    this.hideWhenSinglePage = true,
    super.key,
  });

  final int page;
  final int limit;
  final int total;
  final ValueChanged<int> onPageChanged;
  final bool hideWhenSinglePage;

  @override
  Widget build(BuildContext context) {
    if (limit <= 0 || (hideWhenSinglePage && total <= limit)) {
      return const SizedBox.shrink();
    }
    final pageCount = total == 0 ? 1 : (total / limit).ceil();
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        IconButton(
          tooltip: 'Trang trước',
          onPressed: page > 1 ? () => onPageChanged(page - 1) : null,
          icon: const Icon(Icons.chevron_left),
        ),
        Flexible(
          child: Semantics(
            liveRegion: true,
            child: Text(
              'Trang $page / $pageCount',
              textAlign: TextAlign.center,
            ),
          ),
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
