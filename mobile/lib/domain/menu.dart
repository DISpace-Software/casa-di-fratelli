class MenuDish {
  const MenuDish({
    required this.id,
    required this.name,
    required this.priceMinor,
    this.description = '',
    this.category = 'mains',
    this.drink = false,
    this.image = '',
    this.weight = '',
  });
  final int id, priceMinor;
  final String name, description, category, image, weight;
  final bool drink;
  String get price => (priceMinor / 100).toStringAsFixed(2);
}

class PreorderSettings {
  const PreorderSettings({
    this.enabled = false,
    this.cardPaymentsAvailable = false,
  });
  final bool enabled, cardPaymentsAvailable;
  factory PreorderSettings.fromJson(Map<String, dynamic> json) =>
      PreorderSettings(
        enabled: json['enabled'] == true,
        cardPaymentsAvailable: json['cardPaymentsAvailable'] == true,
      );
}
