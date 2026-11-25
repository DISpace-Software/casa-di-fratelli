class SeatMapException implements Exception {
  const SeatMapException(
    this.message, {
    this.uncertain = false,
    this.code = '',
  });
  final String code;
  final String message;
  final bool uncertain;
  @override
  String toString() => message;
}
