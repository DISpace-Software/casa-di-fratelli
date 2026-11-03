using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SeatMap.Api.Models;

public class ReservationTable
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int Id { get; set; }

    public string TableCode { get; set; } = string.Empty;

    public int ReservationId { get; set; }

    public Reservation Reservation { get; set; } = null!;
}