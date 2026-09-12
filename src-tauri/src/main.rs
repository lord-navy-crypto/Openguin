mod labbridge_server;

fn main() {
    std::thread::Builder::new()
        .name("openguin-labbridge".into())
        .spawn(|| {
            let runtime = tokio::runtime::Runtime::new()
                .expect("create OpenPenguin LabBridge runtime");
            runtime.block_on(labbridge_server::serve());
        })
        .expect("start OpenPenguin LabBridge thread");

    openguin_lib::run();
}
