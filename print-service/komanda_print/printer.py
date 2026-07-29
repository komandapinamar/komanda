from escpos.printer import Usb


def build_usb_printer(
    vendor_id: int,
    product_id: int,
    timeout_seconds: int,
    in_ep: int,
    out_ep: int,
    interface: int,
) -> Usb:
    return Usb(
        vendor_id,
        product_id,
        timeout=timeout_seconds * 1000,
        in_ep=in_ep,
        out_ep=out_ep,
        interface=interface,
    )
