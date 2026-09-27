/**
 * i-Kfz availability of the authority responsible for a plate prefix. The Zulex
 * enum lists `online` and `unavailable`; its description also names `offline`.
 * Anything but `online` means manual processing, which can take days.
 */
export type IkfzStatus = "online" | "unavailable" | "offline"
