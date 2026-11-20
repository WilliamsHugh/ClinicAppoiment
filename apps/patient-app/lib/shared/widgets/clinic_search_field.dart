import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';

class ClinicSearchField extends StatefulWidget {
  const ClinicSearchField({
    this.controller,
    this.hintText = 'Tìm kiếm...',
    this.onChanged,
    this.onSubmitted,
    this.onClear,
    this.semanticsLabel,
    this.autofocus = false,
    this.enabled = true,
    super.key,
  });

  final TextEditingController? controller;
  final String hintText;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;
  final VoidCallback? onClear;
  final String? semanticsLabel;
  final bool autofocus;
  final bool enabled;

  @override
  State<ClinicSearchField> createState() => _ClinicSearchFieldState();
}

class _ClinicSearchFieldState extends State<ClinicSearchField> {
  TextEditingController? _internalController;

  TextEditingController get _effectiveController =>
      widget.controller ?? (_internalController ??= TextEditingController());

  @override
  void initState() {
    super.initState();
    if (widget.controller == null) {
      _internalController = TextEditingController();
    }
  }

  @override
  void didUpdateWidget(covariant ClinicSearchField oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.controller != widget.controller) {
      if (widget.controller != null) {
        _internalController?.dispose();
        _internalController = null;
      } else {
        _internalController ??= TextEditingController();
      }
    }
  }

  @override
  void dispose() {
    _internalController?.dispose();
    super.dispose();
  }

  void _clear() {
    _effectiveController.clear();
    widget.onChanged?.call('');
    widget.onClear?.call();
  }

  @override
  Widget build(BuildContext context) {
    final controller = _effectiveController;
    final field = ConstrainedBox(
      constraints: const BoxConstraints(minHeight: 48),
      child: ValueListenableBuilder<TextEditingValue>(
        valueListenable: controller,
        builder: (context, value, _) {
          final border = OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: ClinicColors.border),
          );
          return TextField(
            controller: controller,
            enabled: widget.enabled,
            autofocus: widget.autofocus,
            textInputAction: TextInputAction.search,
            onChanged: widget.onChanged,
            onSubmitted: widget.onSubmitted,
            decoration: InputDecoration(
              hintText: widget.hintText,
              filled: true,
              fillColor: ClinicColors.card,
              prefixIcon: const Icon(
                Icons.search,
                color: ClinicColors.muted,
              ),
              suffixIcon: value.text.isNotEmpty
                  ? IconButton(
                      tooltip: 'Xóa tìm kiếm',
                      onPressed: widget.enabled ? _clear : null,
                      icon: const Icon(
                        Icons.close,
                        size: 20,
                        color: ClinicColors.muted,
                      ),
                    )
                  : null,
              border: border,
              enabledBorder: border,
              disabledBorder: border,
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(
                  color: ClinicColors.primary,
                  width: 1.5,
                ),
              ),
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 14,
                vertical: 12,
              ),
            ),
          );
        },
      ),
    );

    if (widget.semanticsLabel == null) return field;
    return Semantics(
      label: widget.semanticsLabel,
      container: true,
      explicitChildNodes: true,
      child: field,
    );
  }
}
