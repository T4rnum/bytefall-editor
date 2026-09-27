// Без консольного окна в сборке для Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    bytefall_lib::run()
}
