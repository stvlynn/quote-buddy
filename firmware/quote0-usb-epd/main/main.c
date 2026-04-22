#include "esp_err.h"

#include "epd_uc8251d.h"
#include "protocol.h"

void app_main(void)
{
    (void)epd_init_bus();
    protocol_task(epd_display_frame);
}

