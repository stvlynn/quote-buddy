#include "esp_err.h"

#include "epd_uc8251d.h"
#include "protocol.h"

void app_main(void)
{
    /* Bring the USB text protocol online first so Q0READY and STATUS are
     * available even if EPD init stalls for any reason. */
    protocol_usb_init();

    (void)epd_init_bus();

    /* Blocks forever, draining the USB Serial/JTAG endpoint. */
    protocol_task(epd_display_frame);
}
