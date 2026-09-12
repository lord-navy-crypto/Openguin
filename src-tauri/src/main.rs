mod infrastructure;
mod labbridge_server;

fn main() {
    std::thread::Builder::new()
        .name("openguin-infrastructure".into())
        .spawn(|| {
            let runtime = tokio::runtime::Runtime::new()
                .expect("create OpenPenguin infrastructure runtime");
            runtime.block_on(labbridge_server::serve());
        })
        .expect("start OpenPenguin infrastructure thread");

    openguin_lib::run();
}
