//! 日志展示维度。它们只影响日志文本，不承担业务语义。

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LogType {
    NoneType,
    FileFunc,
    Network,
    Process,
    Config,
}
impl LogType {
    pub fn segment(self) -> &'static str {
        match self {
            Self::NoneType => "[ NONE_TYPE ]",
            Self::FileFunc => "[ FILE_FUNC ]",
            Self::Network => "[ NETWORK ]",
            Self::Process => "[ PROCESS ]",
            Self::Config => "[ CONFIG ]",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LogSource {
    None,
    Core,
    Ui,
}
impl LogSource {
    pub fn segment(self) -> &'static str {
        match self {
            Self::None => "[ NONE ]",
            Self::Core => "[ CORE ]",
            Self::Ui => "[  UI  ]",
        }
    }
}
