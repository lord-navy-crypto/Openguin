use futures_util::StreamExt;
use regex::Regex;
use serde::Serialize;
use serde_json::Value;
use std::{collections::HashSet, fs, process::Command, time::{Duration,SystemTime,UNIX_EPOCH}};
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::AsyncWriteExt;

#[derive(Serialize, Clone)]
#[serde(rename_all="camelCase")]
pub struct IndexModel {
    id:String,name:String,source:String,publisher:String,description:String,
    license:Option<String>,tags:Vec<String>,downloads:Option<u64>,likes:Option<u64>,
    installable:bool,risk:String,format:String,url:String
}

#[derive(Serialize, Clone)]
#[serde(rename_all="camelCase")]
pub struct IndexVariant {
    id:String,label:String,size_bytes:Option<u64>,context:Option<String>,quantization:Option<String>,
    source:String,install_kind:String,license:Option<String>,url:String
}

#[derive(Serialize,Clone)]
#[serde(rename_all="camelCase")]
struct RuntimeInstallProgress { stage:String, detail:String, percent:f64, done:bool, error:Option<String> }

fn emit_install(app:&AppHandle,stage:&str,detail:&str,percent:f64,done:bool,error:Option<String>){
    let _=app.emit("openguin://runtime-install-progress",RuntimeInstallProgress{stage:stage.into(),detail:detail.into(),percent,done,error});
}
fn strip_html(s:&str)->String{
    let tags=Regex::new(r"(?s)<[^>]+>").unwrap(); let ws=Regex::new(r"\s+").unwrap();
    let t=tags.replace_all(s," ").replace("&amp;","&").replace("&quot;","\"").replace("&#39;","'");
    ws.replace_all(t.trim()," ").to_string()
}
fn parse_bytes(s:&str)->Option<u64>{
    let re=Regex::new(r"(?i)(\d+(?:\.\d+)?)\s*(KB|MB|GB|TB)").ok()?; let c=re.captures(s)?;
    let n:f64 = c.get(1)?.as_str().parse::<f64>().ok()?;
    let m=match c.get(2)?.as_str().to_ascii_uppercase().as_str(){"KB"=>1024f64,"MB"=>1024f64.powi(2),"GB"=>1024f64.powi(3),"TB"=>1024f64.powi(4),_=>1.0};
    Some((n*m) as u64)
}
fn known_license(tags:&[String],card:&Value)->Option<String>{
    card.get("license").and_then(Value::as_str).map(str::to_string).or_else(||tags.iter().find_map(|t|t.strip_prefix("license:").map(str::to_string)))
}

async fn ollama_index(query:&str,limit:usize)->Result<Vec<IndexModel>,String>{
    let c=reqwest::Client::builder().timeout(Duration::from_secs(20)).user_agent("Openguin/0.10").build().map_err(|e|e.to_string())?;
    let mut req=c.get("https://ollama.com/library").query(&[("sort","popular")]);
    if !query.trim().is_empty(){req=req.query(&[("q",query.trim())]);}
    let html=req.send().await.map_err(|e|e.to_string())?.error_for_status().map_err(|e|e.to_string())?.text().await.map_err(|e|e.to_string())?;
    let card=Regex::new(r#"(?s)<a[^>]+href=[\"']/library/([^\"'/?#]+)[\"'][^>]*>(.*?)</a>"#).map_err(|e|e.to_string())?;
    let mut seen=HashSet::new();let mut out=Vec::new();
    for cap in card.captures_iter(&html){
        let name=cap.get(1).map(|m|m.as_str()).unwrap_or("").trim();if name.is_empty()||name.contains('/')||!seen.insert(name.to_string()){continue}
        let text=strip_html(cap.get(2).map(|m|m.as_str()).unwrap_or(""));let low=text.to_ascii_lowercase();
        let tags=["vision","tools","thinking","embedding","cloud"].into_iter().filter(|x|low.contains(x)).map(str::to_string).collect();
        let mut desc=text.replace(name,"").trim().to_string(); if desc.len()>260{desc.truncate(260);desc.push('…')}
        out.push(IndexModel{id:format!("ollama:{name}"),name:name.into(),source:"Ollama".into(),publisher:"Ollama registry".into(),description:desc,license:None,tags,downloads:None,likes:None,installable:true,risk:"registry".into(),format:"Ollama".into(),url:format!("https://ollama.com/library/{name}")});
        if out.len()>=limit{break}
    }
    Ok(out)
}

async fn hf_index(query:&str,limit:usize)->Result<Vec<IndexModel>,String>{
    let c=reqwest::Client::builder().timeout(Duration::from_secs(25)).user_agent("Openguin/0.10").build().map_err(|e|e.to_string())?;
    let mut p=vec![("filter","gguf".to_string()),("sort","downloads".into()),("direction","-1".into()),("limit",limit.min(100).to_string()),("full","true".into())];
    if !query.trim().is_empty(){p.push(("search",query.trim().to_string()));}
    let rows=c.get("https://huggingface.co/api/models").query(&p).send().await.map_err(|e|e.to_string())?.error_for_status().map_err(|e|e.to_string())?.json::<Vec<Value>>().await.map_err(|e|e.to_string())?;
    Ok(rows.into_iter().filter_map(|v|{
        let id=v.get("id")?.as_str()?.to_string();let publisher=id.split('/').next().unwrap_or("community").to_string();
        let tags=v.get("tags").and_then(Value::as_array).map(|a|a.iter().filter_map(Value::as_str).map(str::to_string).collect::<Vec<_>>()).unwrap_or_default();
        let card=v.get("cardData").cloned().unwrap_or(Value::Null);let license=known_license(&tags,&card);let gated=v.get("gated").and_then(Value::as_bool).unwrap_or(false);
        let low_risk=license.is_some()&&!gated;let task=v.get("pipeline_tag").and_then(Value::as_str).unwrap_or("local inference");
        Some(IndexModel{id:format!("hf:{id}"),name:id.clone(),source:"Hugging Face".into(),publisher,description:format!("Community GGUF repository for {task}. Open the model card for architecture, limitations and intended use."),license,tags,downloads:v.get("downloads").and_then(Value::as_u64),likes:v.get("likes").and_then(Value::as_u64),installable:low_risk,risk:if gated{"gated".into()}else if low_risk{"low".into()}else{"review".into()},format:"GGUF".into(),url:format!("https://huggingface.co/{id}")})
    }).collect())
}

async fn github_index(query:&str,limit:usize)->Result<Vec<IndexModel>,String>{
    let q=if query.trim().is_empty(){"GGUF local LLM".to_string()}else{format!("{} GGUF model",query.trim())};
    let c=reqwest::Client::builder().timeout(Duration::from_secs(20)).user_agent("Openguin/0.10").build().map_err(|e|e.to_string())?;
    let v=c.get("https://api.github.com/search/repositories").query(&[("q",q),("sort","stars".into()),("order","desc".into()),("per_page",limit.min(30).to_string())]).send().await.map_err(|e|e.to_string())?.error_for_status().map_err(|e|e.to_string())?.json::<Value>().await.map_err(|e|e.to_string())?;
    Ok(v.get("items").and_then(Value::as_array).cloned().unwrap_or_default().into_iter().filter_map(|r|{
        let name=r.get("full_name")?.as_str()?.to_string();let publisher=r.get("owner").and_then(|o|o.get("login")).and_then(Value::as_str).unwrap_or("community").to_string();
        let license=r.get("license").and_then(|x|x.get("spdx_id")).and_then(Value::as_str).filter(|s|*s!="NOASSERTION").map(str::to_string);
        Some(IndexModel{id:format!("github:{name}"),name:name.clone(),source:"GitHub".into(),publisher,description:r.get("description").and_then(Value::as_str).unwrap_or("Open-source model-related project.").to_string(),license,tags:vec!["project".into()],downloads:None,likes:r.get("stargazers_count").and_then(Value::as_u64),installable:false,risk:"review".into(),format:"Project metadata".into(),url:r.get("html_url").and_then(Value::as_str).unwrap_or("").to_string()})
    }).collect())
}

#[tauri::command]
pub async fn universal_model_search(query:Option<String>,source:Option<String>,limit:Option<u16>)->Result<Vec<IndexModel>,String>{
    let q=query.unwrap_or_default();let s=source.unwrap_or_else(||"all".into());let n=limit.unwrap_or(60).clamp(10,150) as usize;let mut out=Vec::new();let each=(n/3).max(20);
    if s=="all"||s=="ollama"{out.extend(ollama_index(&q,each).await.unwrap_or_default())}
    if s=="all"||s=="huggingface"{out.extend(hf_index(&q,each).await.unwrap_or_default())}
    if s=="all"||s=="github"{out.extend(github_index(&q,each.min(30)).await.unwrap_or_default())}
    out.truncate(n);Ok(out)
}

#[tauri::command]
pub async fn universal_model_variants(source:String,id:String)->Result<Vec<IndexVariant>,String>{
    match source.as_str(){
        "Ollama"=>{
            let model=id.strip_prefix("ollama:").unwrap_or(&id);let c=reqwest::Client::builder().timeout(Duration::from_secs(20)).user_agent("Openguin/0.10").build().map_err(|e|e.to_string())?;
            let html=c.get(format!("https://ollama.com/library/{model}/tags")).send().await.map_err(|e|e.to_string())?.error_for_status().map_err(|e|e.to_string())?.text().await.map_err(|e|e.to_string())?;
            let a=Regex::new(r#"(?s)<a[^>]+href=[\"']/library/([^\"']+)[\"'][^>]*>(.*?)</a>"#).map_err(|e|e.to_string())?;let mut seen=HashSet::new();let mut out=Vec::new();
            for cap in a.captures_iter(&html){let full=cap.get(1).map(|m|m.as_str()).unwrap_or("");if !full.starts_with(&format!("{model}:"))||!seen.insert(full.to_string()){continue}let text=strip_html(cap.get(2).map(|m|m.as_str()).unwrap_or(""));let quant=Regex::new(r"(?i)(Q\d(?:_[A-Z0-9]+)+|FP16|BF16)").ok().and_then(|r|r.find(&text).map(|m|m.as_str().to_string()));let ctx=Regex::new(r"(?i)(\d+(?:\.\d+)?[KM]?)\s*context").ok().and_then(|r|r.captures(&text)).and_then(|c|c.get(1).map(|m|m.as_str().to_string()));out.push(IndexVariant{id:full.into(),label:full.into(),size_bytes:parse_bytes(&text),context:ctx,quantization:quant,source:"Ollama".into(),install_kind:"pull".into(),license:None,url:format!("https://ollama.com/library/{}",full.replace(':',"%3A"))});if out.len()>=120{break}}
            Ok(out)
        }
        "Hugging Face"=>{
            let repo=id.strip_prefix("hf:").unwrap_or(&id).to_string();let vars=super::list_hf_gguf_variants(repo.clone()).await?;
            Ok(vars.into_iter().map(|v|IndexVariant{id:v.filename.clone(),label:format!("{} · {}",v.quantization,v.filename),size_bytes:Some(v.size),context:None,quantization:Some(v.quantization),source:"Hugging Face".into(),install_kind:"gguf-import".into(),license:None,url:v.source_url}).collect())
        }
        _=>Ok(vec![])
    }
}

#[tauri::command]
pub async fn repair_bundled_runtime(app:AppHandle)->Result<String,String>{
    let base=app.path().app_data_dir().map_err(|e|e.to_string())?;fs::create_dir_all(&base).map_err(|e|e.to_string())?;
    let stamp=SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e|e.to_string())?.as_secs();let work=base.join(format!("runtime-repair-{stamp}"));fs::create_dir_all(&work).map_err(|e|e.to_string())?;let zip=work.join("Ollama-darwin.zip");
    emit_install(&app,"download","Downloading official Ollama macOS runtime…",2.0,false,None);
    let c=reqwest::Client::builder().timeout(Duration::from_secs(1800)).user_agent("Openguin/0.10").build().map_err(|e|e.to_string())?;let r=c.get("https://ollama.com/download/Ollama-darwin.zip").send().await.map_err(|e|e.to_string())?.error_for_status().map_err(|e|e.to_string())?;let total=r.content_length().unwrap_or(0);let mut stream=r.bytes_stream();let mut f=tokio::fs::File::create(&zip).await.map_err(|e|e.to_string())?;let mut got=0u64;
    while let Some(ch)=stream.next().await{let b=ch.map_err(|e|e.to_string())?;f.write_all(&b).await.map_err(|e|e.to_string())?;got+=b.len() as u64;let p=if total>0{2.0+(got as f64/total as f64)*63.0}else{35.0};emit_install(&app,"download",&format!("Downloaded {} MB",got/1024/1024),p,false,None)}f.flush().await.map_err(|e|e.to_string())?;
    emit_install(&app,"extract","Extracting Ollama.app…",70.0,false,None);let extracted=work.join("extract");fs::create_dir_all(&extracted).map_err(|e|e.to_string())?;let st=Command::new("ditto").args(["-x","-k"]).arg(&zip).arg(&extracted).status().map_err(|e|e.to_string())?;if !st.success(){return Err("macOS ditto could not extract the official Ollama archive".into())}
    let src=extracted.join("Ollama.app/Contents/Resources");if !src.join("ollama").is_file(){return Err("Official archive did not contain Ollama.app/Contents/Resources/ollama".into())}
    let target=base.join("ollama-runtime");if target.exists(){fs::remove_dir_all(&target).map_err(|e|e.to_string())?}emit_install(&app,"install","Installing private Openguin runtime…",85.0,false,None);let st=Command::new("ditto").arg(&src).arg(&target).status().map_err(|e|e.to_string())?;if !st.success(){return Err("Could not install Ollama Resources into Openguin App Data".into())}
    if !target.join("ollama").is_file(){return Err("Installed runtime is missing ollama executable".into())}let _=Command::new("chmod").args(["+x"]).arg(target.join("ollama")).status();let _=Command::new("chmod").args(["+x"]).arg(target.join("llama-server")).status();let _=fs::remove_dir_all(&work);emit_install(&app,"done","Private Ollama runtime installed. Start Bundled mode now.",100.0,true,None);Ok(target.to_string_lossy().into())
}
